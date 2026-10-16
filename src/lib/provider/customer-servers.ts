import { DOGESMS_PROVIDER_ID } from "@/lib/provider/dogesms";

/**
 * The servers a customer can ask for by name, and the provider behind each.
 * Server I is the default route and is never asked for by name. Kept here,
 * server side, so customer-facing code only ever says "Server II".
 */
export type CustomerServer = "II";

const SERVER_PROVIDERS: Record<CustomerServer, string> = { II: DOGESMS_PROVIDER_ID };

/** The provider behind a customer-facing server name; undefined for any
 *  other value, so an unknown name can never select a provider. */
export function providerForServer(server: string | undefined): string | undefined {
  return server && Object.hasOwn(SERVER_PROVIDERS, server)
    ? SERVER_PROVIDERS[server as CustomerServer]
    : undefined;
}
