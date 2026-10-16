import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController assignment permissions', () => {
  const service = { createInternal: jest.fn(), update: jest.fn() };
  let controller: TicketsController;
  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TicketsController(service as unknown as TicketsService);
  });
  it('impede atribuição pelo PATCH quando o perfil só pode editar chamados', () => {
    const req = {
      user: {
        sub: 'operator',
        role: 'NORMAL',
        accessPolicy: { tickets: { update: true, assign: false } },
      },
    } as unknown as Request;
    expect(() =>
      controller.update(req, 'ticket', { assignedToUserId: 'user' }),
    ).toThrow(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('impede atribuição ao criar chamado sem a permissão correspondente', () => {
    const req = {
      user: {
        sub: 'operator',
        role: 'NORMAL',
        accessPolicy: { tickets: { create: true, assign: false } },
      },
    } as unknown as Request;
    expect(() =>
      controller.create(req, {
        clientId: 'client',
        title: 'Falha',
        description: 'Falha do gerador',
        category: 'OTHER',
        assignedToUserId: 'user',
      }),
    ).toThrow(ForbiddenException);
    expect(service.createInternal).not.toHaveBeenCalled();
  });
  it('permite editar os outros dados sem exigir a permissão de atribuição', async () => {
    const req = {
      user: {
        sub: 'operator',
        role: 'NORMAL',
        accessPolicy: { tickets: { update: true, assign: false } },
      },
      headers: {},
    } as unknown as Request;
    await controller.update(req, 'ticket', { title: 'Novo título' });
    expect(service.update).toHaveBeenCalled();
  });
  it('permite remover ou atribuir responsável a quem possui a permissão', async () => {
    const req = {
      user: {
        sub: 'operator',
        role: 'NORMAL',
        accessPolicy: { tickets: { assign: true } },
      },
      headers: {},
    } as unknown as Request;
    await controller.update(req, 'ticket', { assignedToUserId: 'user' });
    expect(service.update).toHaveBeenCalled();
  });
});
