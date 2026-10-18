import { toast } from "sonner";

export type MailKind = "updated" | "deleted" | "approved" | "rejected";

const SUBJECTS: Record<MailKind, string> = {
  updated: "Twój wniosek został zmieniony",
  deleted: "Twój wniosek został usunięty",
  approved: "Twój wniosek został zaakceptowany",
  rejected: "Twój wniosek został odrzucony",
};

/**
 * PLACEHOLDER mailer — nothing is actually sent yet.
 * Replace the body with a real server-side send when email is configured.
 */
export async function notifyApplicant(to: string | null | undefined, kind: MailKind, details: Record<string, unknown>) {
  const subject = SUBJECTS[kind];
  console.info("[mailer:placeholder]", { to, subject, details });
  toast.info(`Powiadomienie e-mail (wersja testowa): „${subject}”${to ? ` → ${to}` : " — brak adresu"}`);
}
