"use client";

import { useEffect, useState } from "react";

type Satir = { tur: string; tarz: string; acilan: number; olumlu: number; ret: number };
type Sonuc = {
  kuyruk: { onayBekleyen: number; onaylanan: number; gonderilen: number; basarisiz: number; reddedilen: number };
  whatsappAcilan: number;
  minOrnek: number;
  satirlar: Satir[];
};

const yuzde = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

export function MesajSonuclari() {
  const [data, setData] = useState<Sonuc | null>(null);

  useEffect(() => {
    fetch("/api/mesaj-sonuc").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => undefined);
  }, []);

  if (!data) return null;
  const k = data.kuyruk;
  return (
    <section className="card panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <div>
          <div className="page-kicker">Ölçüm</div>
          <h2>Mesaj sonuçları</h2>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span className="pill mute">WhatsApp’ta açılan {data.whatsappAcilan}</span>
        <span className="pill mute">Onay bekleyen {k.onayBekleyen}</span>
        <span className="pill mute">Onaylanan {k.onaylanan}</span>
        <span className="pill ok">Gönderilen {k.gonderilen}</span>
        <span className={`pill ${k.basarisiz ? "bad" : "mute"}`}>Başarısız {k.basarisiz}</span>
      </div>
      {data.satirlar.length ? (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted" style={{ textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>Mesaj türü</th>
                <th style={{ padding: "6px 8px" }}>Tarz</th>
                <th style={{ padding: "6px 8px" }}>Açılan</th>
                <th style={{ padding: "6px 8px" }}>Olumlu dönüş</th>
                <th style={{ padding: "6px 8px" }}>İlgilenmiyor</th>
              </tr>
            </thead>
            <tbody>
              {data.satirlar.map((s) => (
                <tr key={`${s.tur}-${s.tarz}`} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 8px" }}>{s.tur}</td>
                  <td style={{ padding: "6px 8px" }}>{s.tarz}</td>
                  <td style={{ padding: "6px 8px" }}>{s.acilan}</td>
                  <td style={{ padding: "6px 8px" }}>{s.olumlu} {s.acilan >= data.minOrnek ? <span className="muted">({yuzde(s.olumlu, s.acilan)})</span> : null}</td>
                  <td style={{ padding: "6px 8px" }}>{s.ret}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="panel-note" style={{ marginTop: 10 }}>Henüz Müşteriler ekranından açılmış mesaj yok.</p>
      )}
      <p className="panel-note" style={{ marginTop: 10 }}>
        “Olumlu dönüş” ve “İlgilenmiyor”, müşterinin Müşteriler ekranında işaretlenen durumundan gelir. WhatsApp teslim, okunma ve cevap bilgisini bu sisteme iletmez.
        Oran, bir tarz en az {data.minOrnek} kez açıldıktan sonra gösterilir; daha az veriyle kazanan seçilmez.
      </p>
    </section>
  );
}
