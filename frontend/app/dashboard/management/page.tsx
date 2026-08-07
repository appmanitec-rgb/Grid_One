import { redirect } from "next/navigation";

export default function ManagementIndexPage() {
  redirect("/dashboard/management/users");
}
