import { AccountData } from "@/components/account-data";
import { AccountSecurity } from "@/components/account-security";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";

export default function AccountPage() {
  return (
    <div className="pb-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif text-primary tracking-tight">
            Account security
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage sign-in methods, including an authenticator app or phone
            verification, and download or delete your data.
          </p>
        </div>
        <Link
          href="/you"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="you-profile-link"
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
          Back to your profile
        </Link>
      </header>
      <AccountSecurity />
      <AccountData />
    </div>
  );
}
