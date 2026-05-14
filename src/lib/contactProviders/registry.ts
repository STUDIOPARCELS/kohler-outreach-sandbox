// Picks the active contact provider based on environment. Real key →
// RocketReach. Otherwise → mock.

import { mockContactProvider } from "./mock";
import { rocketReachProvider } from "./rocketreach";
import type { ContactProvider } from "./types";

export function getContactProvider(prefer?: "rocketreach" | "mock"): ContactProvider {
  if (prefer === "mock") return mockContactProvider;
  if (prefer === "rocketreach") return rocketReachProvider;
  if (rocketReachProvider.isConfigured()) return rocketReachProvider;
  return mockContactProvider;
}

export function listContactProviders(): ContactProvider[] {
  return [rocketReachProvider, mockContactProvider];
}
