import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OfferStatus, ApprovalLevel, ApprovalDecision, UserRole } from '../../constants/enums';
import {
  getApprovalLevelBySalary,
  getNextApprovalLevel,
  requiresSeniorApproval,
  DEFAULT_SALARY_APPROVAL_RULES,
} from '../../constants/approval';

@Injectable()
export class ApprovalService {
  constructor(private prisma: PrismaService) {}

  async determineRequiredApprovalLevel(offerId: number): Promise<ApprovalLevel> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { job: true },
    });

    if (!offer) {
      throw new BadRequestException('Offer not found');
    }

    const salary = Number(offer.salary);
    const department = offer.job?.department;
    const salaryRange = offer.job?.salaryRange;

    let requiredLevel = getApprovalLevelBySalary(salary, department);

    if (requiresSeniorApproval(salary, salaryRange)) {
      const nextLevel = getNextApprovalLevel(requiredLevel);
      if (nextLevel) {
        requiredLevel = nextLevel;
      }
    }

    return requiredLevel;
  }

  async getApproverForLevel(
    approvalLevel: ApprovalLevel,
    department?: string
  ): Promise<{ role: UserRole; userId?: number }> {
    const rule = DEFAULT_SALARY_APPROVAL_RULES.find(
      (r) => r.approvalLevel === approvalLevel && r.department === department
    ) || DEFAULT_SALARY_APPROVAL_RULES.find((r) => r.approvalLevel === approvalLevel && !r.department);

    if (!rule) {
      return { role: UserRole.ADMIN };
    }

    const dbRule = await this.prisma.salaryApprovalRule.findFirst({
      where: {
        approvalLevel,
        department: department || null,
      },
      include: { approver: true },
    });

    if (dbRule?.approverId) {
      return { role: rule.approverRole, userId: dbRule.approverId };
    }

    return { role: rule.approverRole };
  }

  async checkApprovalPermission(
    userId: number,
    userRole: UserRole,
    offerId: number
  ): Promise<boolean> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { job: true },
    });

    if (!offer) {
      throw new BadRequestException('Offer not found');
    }

    if (userRole === UserRole.ADMIN) {
      return true;
    }

    if (offer.currentApprovalLevel === ApprovalLevel.LEVEL_1 ||
        offer.currentApprovalLevel === ApprovalLevel.LEVEL_2) {
      if (userRole === UserRole.HIRING_MANAGER && offer.job?.hiringManagerId === userId) {
        return true;
      }
    }

    if (offer.currentApprovalLevel === ApprovalLevel.LEVEL_3) {
      return userRole === UserRole.ADMIN;
    }

    return false;
  }

  async recordApprovalHistory(
    offerId: number,
    approverId: number,
    approvalLevel: ApprovalLevel,
    decision: ApprovalDecision,
    salary: number,
    comment?: string
  ): Promise<void> {
    await this.prisma.offerApprovalHistory.create({
      data: {
        offerId,
        approverId,
        approvalLevel,
        decision,
        salaryAtTime: salary,
        comment,
      },
    });
  }

  async escalateApproval(offerId: number, reason?: string): Promise<any> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { job: true, approver: { select: publicUserSelect } },
    });

    if (!offer) {
      throw new BadRequestException('Offer not found');
    }

    const currentLevel = offer.currentApprovalLevel || ApprovalLevel.LEVEL_1;
    const nextLevel = getNextApprovalLevel(currentLevel);

    if (!nextLevel) {
      throw new BadRequestException('Already at highest approval level');
    }

    const nextStatus = nextLevel === ApprovalLevel.LEVEL_3
      ? OfferStatus.PENDING_SENIOR_APPROVAL
      : OfferStatus.PENDING_APPROVAL;

    return this.prisma.offer.update({
      where: { id: offerId },
      data: {
        currentApprovalLevel: nextLevel,
        status: nextStatus,
        approvalReason: reason,
      },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });
  }

  calculateStatusForApprovalLevel(level: ApprovalLevel): OfferStatus {
    if (level === ApprovalLevel.LEVEL_3) {
      return OfferStatus.PENDING_SENIOR_APPROVAL;
    }
    return OfferStatus.PENDING_APPROVAL;
  }
}
