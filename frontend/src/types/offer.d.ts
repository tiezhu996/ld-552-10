import { OfferStatus, ApprovalLevel, ApprovalDecision } from '../constants/enums';

declare global {
  interface Offer {
    id: number;
    candidateId: number;
    jobId: number;
    salary: string;
    startDate: string;
    status: OfferStatus;
    approverId: number;
    currentApprovalLevel?: ApprovalLevel | null;
    approvalReason?: string | null;
    job?: Job;
    approver?: User;
    approvalHistories?: OfferApprovalHistory[];
  }

  interface OfferApprovalHistory {
    id: number;
    offerId: number;
    approverId: number;
    approvalLevel: ApprovalLevel;
    decision: ApprovalDecision;
    comment?: string | null;
    salaryAtTime: string;
    createdAt: string;
    approver?: User;
  }

  interface SalaryApprovalRule {
    id: number;
    department?: string | null;
    minSalary: string;
    maxSalary?: string | null;
    approvalLevel: ApprovalLevel;
    approverRole: string;
    approverId?: number | null;
    approver?: User;
  }
}

export {};
