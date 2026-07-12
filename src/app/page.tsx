import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/app");
  }

  redirect("/login");
}
