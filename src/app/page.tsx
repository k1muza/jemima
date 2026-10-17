import { redirect } from "next/navigation";

// No marketing site yet — send everyone to the dashboard (proxy.ts handles auth).
export default function Home() {
  redirect("/dashboard");
}
