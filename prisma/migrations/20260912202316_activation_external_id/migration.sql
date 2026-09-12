-- Store the provider's own activation id so the SMS can be polled through the
-- provider interface. Delivery timing now belongs to the provider, so the
-- simulated deliverAt column is no longer meaningful.
ALTER TABLE "activations" ADD COLUMN "externalId" TEXT;
ALTER TABLE "activations" DROP COLUMN "deliverAt";
