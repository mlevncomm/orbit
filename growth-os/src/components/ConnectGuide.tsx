"use client";

export type GuideStep = {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

export function ConnectGuide({
  title,
  kicker,
  steps,
  copyValue,
  id,
  note,
}: {
  title: string;
  kicker?: string;
  steps: GuideStep[];
  copyValue?: string;
  id?: string;
  note?: string;
}) {
  return (
    <section className="card panel guide-card" id={id}>
      <div className="panel-head">
        <div>
          <div className="page-kicker">{kicker ?? "Kılavuz"}</div>
          <h2>{title}</h2>
        </div>
      </div>
      {note ? <p className="panel-note">{note}</p> : null}
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <b>
              <span>{i + 1}</span>
              {s.title}
            </b>
            <p>
              {s.body}
              {s.href ? (
                <>
                  {" "}
                  <a href={s.href} target="_blank" rel="noreferrer">
                    {s.linkLabel ?? "Sayfayı aç"}
                  </a>
                </>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
      {copyValue ? (
        <label className="field" style={{ marginTop: 12 }}>
          <span>Kopyalanacak adres</span>
          <input readOnly value={copyValue} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
    </section>
  );
}
