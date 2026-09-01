import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/supabase/supabase-client.provider';
import { InviteCurator } from './dto/invite-curator.dto';

@Injectable()
export class DeveloperService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,) {}

  async inviteCurator(dto: InviteCurator) {
    // 
  }
}
