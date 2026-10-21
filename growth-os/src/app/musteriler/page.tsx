import { Suspense } from "react";
import Ui from "./ui";

export default function Page() {
  return (
    <Suspense fallback={<p className="page-copy">Liste yükleniyor…</p>}>
      <Ui />
    </Suspense>
  );
}
