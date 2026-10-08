import { redirect } from "next/navigation";
import { HOME_AFTER_LOGIN } from "@/lib/constants";

/** The console root sends you to the functional page; the sign-in guard handles the rest. */
export default function RootPage() {
  redirect(HOME_AFTER_LOGIN);
}
