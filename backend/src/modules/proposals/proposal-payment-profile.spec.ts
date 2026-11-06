import { ProposalPaymentMethod, ProposalPaymentPurpose } from '@prisma/client';
import { assertProposalPaymentProfile } from './proposal-payment-profile';
const profile = {
  purpose: ProposalPaymentPurpose.PARTS,
  method: ProposalPaymentMethod.PIX,
  beneficiaryDocument: '11.222.333/0001-81',
  issuerCompany: { cnpj: '11222333000181' },
  pixKey: 'fixture@example.invalid',
  boletoInstructions: null,
};
describe('Existing issuer and account policy reused by the conference', () => {
  it('accepts the same CNPJ with different formatting', () =>
    expect(() =>
      assertProposalPaymentProfile(profile, ProposalPaymentPurpose.PARTS),
    ).not.toThrow());
  it('rejects missing, inactive/unavailable or wrong-purpose accounts', () => {
    expect(() =>
      assertProposalPaymentProfile(undefined, ProposalPaymentPurpose.PARTS),
    ).toThrow('perfil de pagamento ativo');
    expect(() =>
      assertProposalPaymentProfile(profile, ProposalPaymentPurpose.SERVICES),
    ).toThrow('servicos');
  });
  it('does not permit an issuer different from the beneficiary', () =>
    expect(() =>
      assertProposalPaymentProfile(
        { ...profile, beneficiaryDocument: '00000000000000' },
        ProposalPaymentPurpose.PARTS,
      ),
    ).toThrow('igual ao favorecido'));
  it('requires the payment details corresponding to the configured method', () => {
    expect(() =>
      assertProposalPaymentProfile(
        { ...profile, pixKey: null },
        ProposalPaymentPurpose.PARTS,
      ),
    ).toThrow('chave cadastrada');
    expect(() =>
      assertProposalPaymentProfile(
        { ...profile, method: ProposalPaymentMethod.BOLETO },
        ProposalPaymentPurpose.PARTS,
      ),
    ).toThrow('instrucoes');
  });
});
