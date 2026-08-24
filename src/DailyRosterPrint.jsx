import "./daily-roster-print.css";
import { useEffect } from "react";
import { Cloud, Printer, X } from "lucide-react";
function coverageState(slot) {
  if (slot.state) return slot.state;
  if (slot.scheduled < slot.required) return "deficit";
  if (slot.scheduled > slot.required) return "excess";
  return "ok";
}

function badgeClass(person) {
  return person.badge?.toLowerCase().includes("manager")
    ? "manager"
    : "trainer";
}

export function DailyRosterPrint({
  open,
  data,
  onClose,
  brandName = "ORDO Workforce Studio",
  moduleName = "WORKRHYTHM · DAILY ROSTER",
  onBeforePrint,
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const slots = data.coverage.slice(0, 24);
  const handlePrint = () => {
    onBeforePrint?.();
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <div
      className="rex-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Podgląd wydruku grafiku dziennego"
    >
      <div className="rex-print-toolbar">
        <div className="rex-print-toolbar-title">
          <Printer size={18} />
          <span>
            <strong>Podgląd wydruku</strong>
            <small>A4 · orientacja pozioma · 1 strona</small>
          </span>
        </div>
        <div className="rex-print-toolbar-actions">
          <button type="button" className="rex-print-btn secondary" onClick={onClose}>
            <X size={15} /> Zamknij
          </button>
          <button type="button" className="rex-print-btn primary" onClick={handlePrint}>
            <Printer size={15} /> Drukuj / zapisz PDF
          </button>
        </div>
      </div>

      <article className="rex-print-page">
        <header className="rex-print-header">
          <div className="rex-print-brand">
            <span className="rex-print-brand-mark">
              <Cloud size={24} />
            </span>
            <span>
              <strong>{brandName}</strong>
              <small>{moduleName}</small>
            </span>
          </div>
          <div className="rex-print-title">
            <span>GRAFIK OBSADY</span>
            <h1>{data.dateLabel}</h1>
            <p>
              {data.operationalDayLabel ?? "Doba operacyjna 06:00–06:00"}
              {data.versionLabel ? ` · ${data.versionLabel}` : ""}
            </p>
          </div>
          <div className="rex-print-location">
            <span>RESTAURACJA</span>
            <strong>{data.restaurantName}</strong>
            <small>
              {data.restaurantDetail}
              {data.locationCode ? ` · ${data.locationCode}` : ""}
            </small>
          </div>
        </header>

        <section className="rex-print-summary">
          <div>
            <span>Zmiany</span>
            <strong>{data.shiftCount}</strong>
            <small>{data.employeeCount} pracowników</small>
          </div>
          <div>
            <span>Plan godzin</span>
            <strong>{data.plannedHours}</strong>
            <small>netto</small>
          </div>
          <div>
            <span>Coverage</span>
            <strong>{data.coveragePercent}%</strong>
            <small>{data.coverageAttentionLabel ?? "Bez uwag"}</small>
          </div>
          <div>
            <span>Manager</span>
            <strong>{data.managerHours}</strong>
            <small>otwarcie + zamknięcie</small>
          </div>
          <div>
            <span>Szkolenia</span>
            <strong>{data.trainingHours}</strong>
            <small>{data.trainingPeopleLabel ?? "—"}</small>
          </div>
          <div className="rex-print-management">
            <span>Kierownictwo dnia</span>
            <strong>Otwarcie: {data.openingManager}</strong>
            <strong>Zamknięcie: {data.closingManager}</strong>
          </div>
        </section>

        <main className="rex-print-layout">
          <section className="rex-print-staffing">
            <div className="rex-print-section-title">
              <div>
                <span>01</span>
                <div>
                  <strong>Obsada według stanowisk</strong>
                  <small>Godziny pracy netto · funkcje przy nazwisku</small>
                </div>
              </div>
              <div className="rex-print-flags">
                <span><i className="trainer" /> Trener</span>
                <span><i className="manager" /> Manager</span>
              </div>
            </div>

            <div className="rex-print-station-grid">
              {data.stations.map((station) => (
                <section
                  className={`rex-print-station ${station.tone}`}
                  key={station.id}
                >
                  <header>
                    <span className="rex-print-station-code">{station.code}</span>
                    <strong>{station.name}</strong>
                    <em>{station.hours}</em>
                  </header>
                  {station.people.map((person) => (
                    <div className="rex-print-person" key={person.id}>
                      <span>
                        <strong>{person.name}</strong>
                        {person.badge && (
                          <i className={badgeClass(person)}>{person.badge}</i>
                        )}
                        {person.detail && <small>{person.detail}</small>}
                      </span>
                      <time>{person.time}</time>
                      <em>{person.hours}</em>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </section>

          <aside className="rex-print-aside">
            <section className="rex-print-coverage">
              <div className="rex-print-section-title">
                <div>
                  <span>02</span>
                  <div>
                    <strong>Pokrycie godzinowe</strong>
                    <small>Plan względem obsady idealnej</small>
                  </div>
                </div>
                <b>{data.coveragePercent}%</b>
              </div>
              <div className="rex-print-coverage-hours">
                {slots.map((slot, index) => (
                  <span key={`${slot.label}-${index}`}>{slot.label}</span>
                ))}
              </div>
              <div className="rex-print-coverage-row">
                <label>Idealna</label>
                <div>
                  {slots.map((slot, index) => (
                    <span key={index}>{slot.required}</span>
                  ))}
                </div>
              </div>
              <div className="rex-print-coverage-row planned">
                <label>Plan</label>
                <div>
                  {slots.map((slot, index) => (
                    <span className={coverageState(slot)} key={index}>
                      {slot.scheduled}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rex-print-coverage-legend">
                <span><i className="ok" /> Pokrycie</span>
                <span><i className="deficit" /> Niedobór</span>
                <span><i className="excess" /> Nadmiar</span>
              </div>
            </section>

            <section className="rex-print-hours">
              <div className="rex-print-section-title">
                <div>
                  <span>03</span>
                  <div>
                    <strong>Podsumowanie godzin</strong>
                    <small>Plan i wykonanie</small>
                  </div>
                </div>
              </div>
              <div className="rex-print-hours-head">
                <span>Kategoria</span><span>Plan</span><span>Realizacja</span>
              </div>
              {data.hoursSummary.map((row) => (
                <div className="rex-print-hours-row" key={row.id}>
                  <span>{row.label}</span>
                  <strong>{row.planned}</strong>
                  {row.actual ? <strong>{row.actual}</strong> : <i />}
                </div>
              ))}
              <div className="rex-print-hours-total">
                <span>RAZEM</span>
                <strong>{data.plannedHours}</strong>
                <i />
              </div>
            </section>

            <section className="rex-print-notes">
              <div className="rex-print-section-title">
                <div>
                  <span>04</span>
                  <div>
                    <strong>Priorytety zmiany</strong>
                    <small>Do omówienia na pre-shifcie</small>
                  </div>
                </div>
              </div>
              <ol>
                {data.priorities.slice(0, 3).map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ol>
              <label>
                {data.managerNotesLabel ?? "Uwagi kierownika"}<span />
              </label>
            </section>

            <section className="rex-print-signature">
              <div>
                <span>Kierownik zamykający</span>
                <strong>{data.closingManager}</strong>
              </div>
              <label>Podpis<span /></label>
            </section>
          </aside>
        </main>

        <footer className="rex-print-footer">
          <span>{brandName} · {moduleName.split(" · ")[0]}</span>
          <span>{data.generatedAt ? `Wygenerowano ${data.generatedAt}` : ""}</span>
          <span>
            {data.documentLabel ?? "Dokument operacyjny"}
            {data.locationCode ? ` · ${data.locationCode}` : ""} · strona 1/1
          </span>
        </footer>
      </article>
    </div>
  );
}
