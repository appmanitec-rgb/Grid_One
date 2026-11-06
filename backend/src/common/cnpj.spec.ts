import { hasCnpjFormat, isValidCnpj, normalizeCnpj } from './cnpj';

describe('CNPJ alfanumérico', () => {
  it('preserva letras e aceita os exemplos oficiais da Receita Federal', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('00.000.000/E08G-12')).toBe(true);
  });

  it('rejeita letras nos dígitos verificadores e alteração do DV', () => {
    expect(hasCnpjFormat('12.ABC.345/01DE-3A')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false);
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
  });
});
