// Maps Supabase Auth errors to messages that are safe to show. Pure.

export interface AuthErrorLike {
  code?: string | null;
  status?: number;
  message?: string;
}

export type AuthFailure = { message: string; kind: "credentials" | "unverified" | "exists" | "weak" | "rate" | "expired" | "same" | "generic"; status: number };

export function mapAuthError(e: AuthErrorLike | null | undefined): AuthFailure {
  const code = e?.code ?? "";
  switch (code) {
    case "invalid_credentials":
      return { kind: "credentials", status: 400, message: "Email or password is incorrect." };
    case "email_not_confirmed":
      return { kind: "unverified", status: 403, message: "Verify your email first. We sent you a link when you signed up." };
    case "user_already_exists":
    case "email_exists":
      return { kind: "exists", status: 409, message: "An account with this email already exists. Log in instead." };
    case "weak_password":
      return { kind: "weak", status: 400, message: "That password is too weak. Use a longer password with a mix of characters." };
    case "same_password":
      return { kind: "same", status: 400, message: "Choose a password different from your current one." };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return { kind: "rate", status: 429, message: "Too many attempts. Wait a minute and try again." };
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return { kind: "expired", status: 400, message: "This link has expired or was already used. Request a new one." };
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return { kind: "expired", status: 401, message: "Your session has expired. Log in again." };
    case "signup_disabled":
      return { kind: "generic", status: 403, message: "New sign-ups are currently disabled." };
    default:
      if (e?.status === 429) return { kind: "rate", status: 429, message: "Too many attempts. Wait a minute and try again." };
      return { kind: "generic", status: 400, message: "Something went wrong. Try again in a moment." };
  }
}
