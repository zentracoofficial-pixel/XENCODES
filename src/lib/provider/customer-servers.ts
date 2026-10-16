import { DOGESMS_PROVIDER_ID } from "@/lib/provider/dogesms";
import { GRIZZLYSMS_PROVIDER_ID } from "@/lib/provider/grizzlysms";

/**
 * The servers a customer can choose between, by the names they see, and the
 * provider behind each. Kept here, server side, so customer-facing code only
 * ever says "Server I" and "Server II".
 */
export type CustomerServer = "I" | "II";

const SERVER_PROVIDERS: Record<CustomerServer, string> = {
  I: GRIZZLYSMS_PROVIDER_ID,
  II: DOGESMS_PROVIDER_ID,
};

/** The provider behind a customer-facing server name; undefined for any
 *  other value, so an unknown name can never select a provider. */
export function providerForServer(server: string | undefined): string | undefined {
  return server && Object.hasOwn(SERVER_PROVIDERS, server) ? SERVER_PROVIDERS[server as CustomerServer] : undefined;
}

/** The customer-facing name of a provider, if it has one. */
export function serverForProvider(providerId: string): CustomerServer | undefined {
  return (Object.keys(SERVER_PROVIDERS) as CustomerServer[]).find((server) => SERVER_PROVIDERS[server] === providerId);
}
