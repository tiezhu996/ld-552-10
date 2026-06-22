import { ApprovalLevel, UserRole } from './enums';

export interface SalaryApprovalConfig {
  minSalary: number;
  maxSalary: number | null;
  approvalLevel: ApprovalLevel;
  approverRole: UserRole;
  department?: string;
}

export const DEFAULT_SALARY_APPROVAL_RULES: SalaryApprovalConfig[] = [
  {
    minSalary: 0,
    maxSalary: 20000,
    approvalLevel: ApprovalLevel.LEVEL_1,
    approverRole: UserRole.HIRING_MANAGER,
  },
  {
    minSalary: 20000,
    maxSalary: 40000,
    approvalLevel: ApprovalLevel.LEVEL_2,
    approverRole: UserRole.HIRING_MANAGER,
  },
  {
    minSalary: 40000,
    maxSalary: null,
    approvalLevel: ApprovalLevel.LEVEL_3,
    approverRole: UserRole.ADMIN,
  },
];

export const APPROVAL_LEVEL_TO_STATUS: Record<ApprovalLevel, string> = {
  [ApprovalLevel.LEVEL_1]: 'PENDING_APPROVAL',
  [ApprovalLevel.LEVEL_2]: 'PENDING_APPROVAL',
  [ApprovalLevel.LEVEL_3]: 'PENDING_SENIOR_APPROVAL',
};

export const APPROVAL_LEVEL_ORDER: ApprovalLevel[] = [
  ApprovalLevel.LEVEL_1,
  ApprovalLevel.LEVEL_2,
  ApprovalLevel.LEVEL_3,
];

export function getNextApprovalLevel(currentLevel: ApprovalLevel): ApprovalLevel | null {
  const currentIndex = APPROVAL_LEVEL_ORDER.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex >= APPROVAL_LEVEL_ORDER.length - 1) {
    return null;
  }
  return APPROVAL_LEVEL_ORDER[currentIndex + 1];
}

export function getApprovalLevelBySalary(
  salary: number,
  department?: string,
  rules: SalaryApprovalConfig[] = DEFAULT_SALARY_APPROVAL_RULES
): ApprovalLevel {
  const departmentRules = rules.filter(
    (rule) => rule.department === department
  );
  const effectiveRules = departmentRules.length > 0 ? departmentRules : rules;

  for (const rule of effectiveRules) {
    if (salary >= rule.minSalary && (rule.maxSalary === null || salary < rule.maxSalary)) {
      return rule.approvalLevel;
    }
  }

  return ApprovalLevel.LEVEL_1;
}

export function requiresSeniorApproval(
  salary: number,
  jobSalaryRange?: string
): boolean {
  if (!jobSalaryRange) {
    return false;
  }

  const rangeMatch = jobSalaryRange.match(/(\d+)-(\d+)/);
  if (!rangeMatch) {
    return false;
  }

  const maxRange = parseInt(rangeMatch[2], 10);
  return salary > maxRange;
}
