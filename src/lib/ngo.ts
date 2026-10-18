import { supabase } from "@/integrations/supabase/client";

export async function loadNgoAccess(userId: string) {
  const role = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (role.error) throw role.error;
  const isAdmin = role.data === true;
  let query = supabase.from("bookings").select("organization").order("created_at", { ascending: false });
  // RLS remains the authority; also scope ordinary users explicitly.
  if (!isAdmin) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  let profileNames: string[] = [];
  if (isAdmin) {
    const profiles = await supabase.from("ngo_profiles").select("name").not("name", "is", null);
    if (profiles.error) throw profiles.error;
    profileNames = (profiles.data ?? []).map((row) => row.name ?? "");
  }
  const names = [...new Set([...(data ?? []).map((row) => row.organization), ...profileNames].map((n) => n.trim()).filter(Boolean))];
  return { isAdmin, names: isAdmin ? names.sort((a, b) => a.localeCompare(b, "pl")) : names.slice(0, 1) };
}

export function filterNgoNames(names: string[], search: string) {
  const term = search.trim().toLocaleLowerCase("pl");
  return names.filter((name) => name.toLocaleLowerCase("pl").includes(term));
}
/** KRS is a unique 10-digit number per registered NGO; returns null when invalid. */
export function normalizeKrs(input: string | null | undefined) {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

export function ngoPlUrl(krs: string | null | undefined) {
  const k = normalizeKrs(krs);
  return k ? `https://szukaj.ngo.pl/?search=${k}` : null;
}

/** Rejestr.io identifies organization pages with the numeric KRS, without leading zeros. */
export function ngoRegistryUrl(krs: string | null | undefined) {
  const k = normalizeKrs(krs);
  return k && Number(k) > 0 ? `https://rejestr.io/krs/${Number(k)}` : null;
}
