"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { buttonStyles } from "@/components/inventory/primitives";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

import { login, signup } from "./actions";

const inputClass =
  "h-11 rounded-[9px] border bg-card px-3.5 text-sm text-foreground focus:border-foreground focus:outline-none";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isLogin = mode === "login";
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const linkError = searchParams.get("error") ? "That link is invalid or has expired." : null;
  const [state, formAction, pending] = useActionState(isLogin ? login : signup, undefined);
  const error = state?.error ?? linkError;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-5xl leading-[0.95] tracking-[-0.02em]">{isLogin ? "Sign in" : "Create an account"}</h1>
        <p className="text-sm text-muted-foreground">
          {isLogin ? "Welcome back to the stock room." : "Get started with Jemima's Designs."}
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-low-line bg-low-bg p-4 text-[13px] text-low-fg">
          <span>Supabase isn&apos;t configured yet, so sign-in won&apos;t work. Add your keys to .env.local.</span>
          <Link href="/dashboard" className="font-medium underline underline-offset-4">
            Continue in demo mode →
          </Link>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {!isLogin && (
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Full name
            <input name="full_name" autoComplete="name" required className={inputClass} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Email
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Password
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={6}
            required
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {state?.message && (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message}
          </p>
        )}

        <button type="submit" disabled={pending} className={cn(buttonStyles.primary, "mt-2 h-11")}>
          {pending ? "Please wait…" : isLogin ? "Sign in" : "Sign up"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "No account? " : "Already have an account? "}
          <Link href={isLogin ? "/signup" : "/login"} className="font-medium text-foreground underline underline-offset-4">
            {isLogin ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </form>
    </div>
  );
}
