import { DeliveryChannel } from '@prisma/client';
import { DeliveriesService } from './deliveries.service';

describe('isolated environments never transmit documents externally', () => {
  const originalFlag = process.env.EXTERNAL_DELIVERIES_DISABLED;
  afterEach(() => {
    if (originalFlag === undefined)
      delete process.env.EXTERNAL_DELIVERIES_DISABLED;
    else process.env.EXTERNAL_DELIVERIES_DISABLED = originalFlag;
    jest.restoreAllMocks();
  });
  it.each([
    DeliveryChannel.EMAIL,
    DeliveryChannel.WHATSAPP,
    DeliveryChannel.WEBHOOK,
  ])(
    'keeps %s in manual mode without any network dispatch',
    async (channel) => {
      process.env.EXTERNAL_DELIVERIES_DISABLED = 'true';
      const network = jest.spyOn(global, 'fetch');
      const service = new DeliveriesService({} as never, {} as never);
      const dispatch = Reflect.get(service, 'dispatchDelivery') as (input: {
        channel: DeliveryChannel;
        recipientTarget: string;
        message: string;
        shareUrl: string;
      }) => Promise<{
        mode: string;
        providerConfigured: boolean;
        launchUrl?: string;
      }>;
      const result = await dispatch.call(service, {
        channel,
        recipientTarget: '11999999999',
        message: 'Documento de teste',
        shareUrl: 'http://localhost:3101/share/isolated',
      });
      expect(result.mode).toBe('manual');
      expect(result.providerConfigured).toBe(false);
      expect(network).not.toHaveBeenCalled();
      if (channel === DeliveryChannel.WHATSAPP)
        expect(result.launchUrl).toContain('wa.me/');
    },
  );
});
