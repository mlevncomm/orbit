import { redirect } from "next/navigation";

// Program açılınca doğrudan müşteri bulma ekranı gelir.
export default function Home() {
  redirect("/ara");
}
