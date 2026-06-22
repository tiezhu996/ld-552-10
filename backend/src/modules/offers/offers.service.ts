import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUserSelect } from '../../prisma/selects';
import { OfferStatus, ApprovalLevel, ApprovalDecision, UserRole } from '../../constants/enums';
import { getNextApprovalLevel } from '../../constants/approval';
import { ApprovalService } from './approval.service';

const flow: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: [OfferStatus.PENDING_APPROVAL, OfferStatus.PENDING_SENIOR_APPROVAL, OfferStatus.REJECTED] as OfferStatus[],
  PENDING_APPROVAL: [OfferStatus.APPROVED, OfferStatus.REJECTED, OfferStatus.PENDING_SENIOR_APPROVAL] as OfferStatus[],
  PENDING_SENIOR_APPROVAL: [OfferStatus.APPROVED, OfferStatus.REJECTED] as OfferStatus[],
  APPROVED: [OfferStatus.SENT, OfferStatus.REJECTED] as OfferStatus[],
  SENT: [OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN] as OfferStatus[],
  ACCEPTED: [] as OfferStatus[],
  REJECTED: [] as OfferStatus[],
  WITHDRAWN: [] as OfferStatus[],
};

interface StatusUpdateResult {
  id: number;
  candidateId: number;
  jobId: number;
  salary: string;
  startDate: string;
  status: OfferStatus;
  approverId: number;
  currentApprovalLevel?: ApprovalLevel | null;
  approvalReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  beforeStatus: OfferStatus;
  reason?: string;
  candidate?: any;
  job?: any;
  approver?: any;
}

interface CreateOfferData {
  candidateId: number;
  jobId: number;
  salary: number;
  startDate: string;
  approverId: number;
}

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private approvalService: ApprovalService
  ) {}

  async create(data: CreateOfferData): Promise<any> {
    const offer = await this.prisma.offer.create({
      data: {
        ...data,
        salary: String(data.salary),
        startDate: new Date(data.startDate),
        status: OfferStatus.DRAFT,
      },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });
    return offer;
  }

  async submitForApproval(id: number, currentUserId: number, currentUserRole: UserRole): Promise<any> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException('Only draft offers can be submitted for approval');
    }

    const requiredLevel = await this.approvalService.determineRequiredApprovalLevel(id);
    const targetStatus = this.approvalService.calculateStatusForApprovalLevel(requiredLevel);

    if (!flow[offer.status].includes(targetStatus)) {
      throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${targetStatus}`);
    }

    const updatedOffer = await this.prisma.offer.update({
      where: { id },
      data: {
        status: targetStatus,
        currentApprovalLevel: requiredLevel,
      },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });

    await this.approvalService.recordApprovalHistory(
      id,
      currentUserId,
      requiredLevel,
      ApprovalDecision.APPROVE,
      Number(offer.salary),
      'Submitted for approval'
    );

    return {
      ...updatedOffer,
      beforeStatus: offer.status,
      candidateId: offer.candidateId,
    };
  }

  async approveOffer(
    id: number,
    currentUserId: number,
    currentUserRole: UserRole,
    comment?: string
  ): Promise<StatusUpdateResult> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    const hasPermission = await this.approvalService.checkApprovalPermission(
      currentUserId,
      currentUserRole,
      id
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to approve this offer');
    }

    const currentLevel = offer.currentApprovalLevel || ApprovalLevel.LEVEL_1;
    const requiredLevel = await this.approvalService.determineRequiredApprovalLevel(id);

    await this.approvalService.recordApprovalHistory(
      id,
      currentUserId,
      currentLevel,
      ApprovalDecision.APPROVE,
      Number(offer.salary),
      comment
    );

    let targetStatus: OfferStatus;

    if (currentLevel === requiredLevel) {
      targetStatus = OfferStatus.APPROVED;
    } else {
      const nextLevel = getNextApprovalLevel(currentLevel);
      if (!nextLevel) {
        targetStatus = OfferStatus.APPROVED;
      } else {
        targetStatus = this.approvalService.calculateStatusForApprovalLevel(nextLevel);
      }
    }

    if (!flow[offer.status as OfferStatus].includes(targetStatus)) {
      throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${targetStatus}`);
    }

    const updatedOffer = await this.prisma.offer.update({
      where: { id },
      data: {
        status: targetStatus,
        currentApprovalLevel: currentLevel === requiredLevel ? null : getNextApprovalLevel(currentLevel),
      },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });

    return {
      ...updatedOffer,
      beforeStatus: offer.status as OfferStatus,
      reason: comment,
      candidateId: offer.candidateId,
    };
  }

  async rejectOffer(
    id: number,
    currentUserId: number,
    currentUserRole: UserRole,
    reason?: string
  ): Promise<StatusUpdateResult> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    const hasPermission = await this.approvalService.checkApprovalPermission(
      currentUserId,
      currentUserRole,
      id
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to reject this offer');
    }

    const currentLevel = offer.currentApprovalLevel || ApprovalLevel.LEVEL_1;

    await this.approvalService.recordApprovalHistory(
      id,
      currentUserId,
      currentLevel,
      ApprovalDecision.REJECT,
      Number(offer.salary),
      reason
    );

    return this.updateStatus(id, OfferStatus.REJECTED, currentUserId, reason);
  }

  async escalateOffer(
    id: number,
    currentUserId: number,
    currentUserRole: UserRole,
    reason?: string
  ): Promise<any> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    const hasPermission = await this.approvalService.checkApprovalPermission(
      currentUserId,
      currentUserRole,
      id
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to escalate this offer');
    }

    const currentLevel = offer.currentApprovalLevel || ApprovalLevel.LEVEL_1;

    await this.approvalService.recordApprovalHistory(
      id,
      currentUserId,
      currentLevel,
      ApprovalDecision.ESCALATE,
      Number(offer.salary),
      reason
    );

    return this.approvalService.escalateApproval(id, reason);
  }

  async updateStatus(
    id: number,
    status: OfferStatus,
    currentUserId?: number,
    reason?: string
  ): Promise<StatusUpdateResult> {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (!flow[offer.status as OfferStatus].includes(status)) {
      throw new BadRequestException(`Invalid Offer status transition: ${offer.status} -> ${status}`);
    }

    const updatedOffer = await this.prisma.offer.update({
      where: { id },
      data: { status },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });

    return {
      ...updatedOffer,
      beforeStatus: offer.status as OfferStatus,
      reason,
      candidateId: offer.candidateId,
    };
  }

  async findAll(): Promise<any[]> {
    return this.prisma.offer.findMany({
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
      },
    });
  }

  async findOne(id: number): Promise<any> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: true,
        approver: { select: publicUserSelect },
        approvalHistories: {
          include: {
            approver: { select: publicUserSelect },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }

  async getApprovalHistory(id: number): Promise<any[]> {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return this.prisma.offerApprovalHistory.findMany({
      where: { offerId: id },
      include: {
        approver: { select: publicUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
