import { Body, Controller, Get, Param, Patch, Post, Request } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { OfferStatus, UserRole } from '../../constants/enums';
import { OffersService } from './offers.service';

interface ApproveRequestBody {
  comment?: string;
}

interface RejectRequestBody {
  reason?: string;
}

interface EscalateRequestBody {
  reason?: string;
}

interface StatusUpdateBody {
  status: OfferStatus;
  reason?: string;
}

@Controller('offers')
export class OffersController {
  constructor(private offers: OffersService) {}

  @Post()
  @Roles(UserRole.HR, UserRole.ADMIN)
  create(@Body() body: any, @Request() req: any) {
    return this.offers.create(body);
  }

  @Get()
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  findAll() {
    return this.offers.findAll();
  }

  @Get(':id')
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.offers.findOne(+id);
  }

  @Get(':id/approval-history')
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  getApprovalHistory(@Param('id') id: string) {
    return this.offers.getApprovalHistory(+id);
  }

  @Patch(':id/submit')
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  submitForApproval(@Param('id') id: string, @Request() req: any) {
    return this.offers.submitForApproval(+id, req.user.id, req.user.role);
  }

  @Patch(':id/approve')
  @Roles(UserRole.HIRING_MANAGER, UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() body: ApproveRequestBody, @Request() req: any) {
    return this.offers.approveOffer(+id, req.user.id, req.user.role, body.comment);
  }

  @Patch(':id/reject')
  @Roles(UserRole.HIRING_MANAGER, UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() body: RejectRequestBody, @Request() req: any) {
    return this.offers.rejectOffer(+id, req.user.id, req.user.role, body.reason);
  }

  @Patch(':id/escalate')
  @Roles(UserRole.HIRING_MANAGER, UserRole.ADMIN)
  escalate(@Param('id') id: string, @Body() body: EscalateRequestBody, @Request() req: any) {
    return this.offers.escalateOffer(+id, req.user.id, req.user.role, body.reason);
  }

  @Patch(':id/status')
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  status(@Param('id') id: string, @Body() body: StatusUpdateBody, @Request() req: any) {
    return this.offers.updateStatus(+id, body.status, req.user?.id, body.reason);
  }
}
