import { BadRequestException } from '@nestjs/common';
import { ProposalPaymentMethod, ProposalPaymentPurpose } from '@prisma/client';

type PaymentProfile = {
  purpose: ProposalPaymentPurpose;
  method: ProposalPaymentMethod;
  beneficiaryDocument: string | null;
  issuerCompany?: { cnpj: string | null } | null;
  pixKey: string | null;
  boletoInstructions: string | null;
};
/** The existing fiscal/account policy, reused by saving and the editor conference. */
export function assertProposalPaymentProfile(
  profile: PaymentProfile | undefined,
  purpose: ProposalPaymentPurpose,
): asserts profile is PaymentProfile {
  if (!profile || profile.purpose !== purpose)
    throw new BadRequestException(
      `Selecione um perfil de pagamento ativo para ${purpose === ProposalPaymentPurpose.PARTS ? 'pecas' : 'servicos'}.`,
    );
  const issuerCnpj = (profile.issuerCompany?.cnpj || '').replace(/\D/g, ''),
    beneficiaryCnpj = (profile.beneficiaryDocument || '').replace(/\D/g, '');
  if (issuerCnpj.length !== 14 || beneficiaryCnpj !== issuerCnpj)
    throw new BadRequestException(
      'O perfil de pagamento precisa de CNPJ emitente valido e igual ao favorecido.',
    );
  if (profile.method === ProposalPaymentMethod.PIX && !profile.pixKey)
    throw new BadRequestException(
      'O perfil PIX precisa de uma chave cadastrada.',
    );
  if (
    profile.method === ProposalPaymentMethod.BOLETO &&
    !profile.boletoInstructions
  )
    throw new BadRequestException(
      'O perfil de boleto precisa de instrucoes de cobranca.',
    );
}
