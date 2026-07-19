"use client";

import type { RefObject } from "react";
import type { AiState } from "./use-incident-analysis";
import type { Incident } from "./aegisData";
import { EVENT_PHASE_LABELS } from "./operational-model";
import { Icon, type IconName } from "./Icon";

export type View = "command" | "data" | "simulator" | "audit";

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: "command", label: "Command", icon: "grid" },
  { id: "data", label: "Data Lab", icon: "database" },
  { id: "simulator", label: "Simulator", icon: "play" },
  { id: "audit", label: "Audit", icon: "audit" },
];

interface AppSidebarProps {
  sidebarRef: RefObject<HTMLElement | null>;
  firstNavRef: RefObject<HTMLButtonElement | null>;
  mobileMenuRef: RefObject<HTMLButtonElement | null>;
  mobileNav: boolean;
  view: View;
  interactiveReady: boolean;
  incidents: readonly Incident[];
  degradedZoneCount: number;
  aiState: AiState;
  onSwitchView: (view: View) => void;
  onClose: () => void;
  onStatus: (message: string) => void;
}

export function AppSidebar({
  sidebarRef,
  firstNavRef,
  mobileMenuRef,
  mobileNav,
  view,
  interactiveReady,
  incidents,
  degradedZoneCount,
  aiState,
  onSwitchView,
  onClose,
  onStatus,
}: AppSidebarProps) {
  const awaitingApproval = incidents.some((incident) => incident.status === "Awaiting approval");

  return (
    <>
      <aside ref={sidebarRef} className={`sidebar${mobileNav ? " is-open" : ""}`}>
        <div className="sidebar-brand" role="img" aria-label="AegisGrid home">
          <span className="brand-mark">
            <Icon name="shield" size={28} />
            <i />
            <b />
          </span>
          <span className="brand-compact">AG</span>
        </div>
        <nav aria-label="Primary navigation">
          {NAV.map((item, index) => (
            <button
              ref={index === 0 ? firstNavRef : undefined}
              type="button"
              key={item.id}
              className={view === item.id ? "is-active" : ""}
              onClick={() => onSwitchView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              disabled={!interactiveReady}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
              {item.id === "audit" && awaitingApproval ? <i className="nav-alert" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            aria-label="Announce system status"
            onClick={() =>
              onStatus(
                `${aiState === "available" ? "Hybrid" : "Degraded"} mode · ${degradedZoneCount} degraded zone feeds`,
              )
            }
          >
            <Icon name="sensor" size={19} />
            <span>Status</span>
            <i className={degradedZoneCount ? "status-watch" : "status-ok"} />
          </button>
          <div aria-label="Signed in role: Safety Supervisor" className="profile-nav">
            <span>SS</span>
            <b>Supervisor</b>
          </div>
        </div>
      </aside>
      {mobileNav ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            onClose();
            mobileMenuRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

interface AppTopbarProps {
  mobileMenuRef: RefObject<HTMLButtonElement | null>;
  mobileNav: boolean;
  interactiveReady: boolean;
  aiState: AiState;
  clock: Date | null;
  phase: string;
  activeIncidentCount: number;
  onToggleNavigation: () => void;
  onPhaseChange: (phase: string) => void;
  onReviewIncidents: () => void;
}

export function AppTopbar({
  mobileMenuRef,
  mobileNav,
  interactiveReady,
  aiState,
  clock,
  phase,
  activeIncidentCount,
  onToggleNavigation,
  onPhaseChange,
  onReviewIncidents,
}: AppTopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button
          ref={mobileMenuRef}
          type="button"
          className="mobile-menu-button"
          onClick={onToggleNavigation}
          aria-label="Toggle navigation"
          aria-expanded={mobileNav}
          disabled={!interactiveReady}
        >
          <Icon name={mobileNav ? "x" : "menu"} />
        </button>
        <div>
          <span className="wordmark">
            AEGIS<span>GRID</span>
          </span>
          <small>INCIDENT FUSION &amp; RESPONSE COPILOT</small>
        </div>
        <span className="edition">2026</span>
      </div>
      <div className="topbar-status">
        <span className="feed-badge">
          <i />
          SYNTHETIC SCENARIO FEED
        </span>
        <span className={`ai-health ${aiState}`}>
          <Icon
            name={aiState === "available" ? "spark" : aiState === "checking" ? "clock" : "warning"}
            size={13}
          />
          {aiState === "available"
            ? "AI provider ready"
            : aiState === "checking"
              ? "Checking AI health"
              : "AI analysis unavailable."}
        </span>
        <div className="event-clock">
          <span>
            {clock
              ? clock
                  .toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })
                  .toUpperCase()
              : "LOCAL TIME"}
          </span>
          <strong>
            {clock ? clock.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"}
          </strong>
          <small>IST</small>
        </div>
      </div>
      <div className="topbar-actions">
        <label className="phase-select">
          <span>EVENT PHASE</span>
          <select value={phase} onChange={(event) => onPhaseChange(event.target.value)}>
            {EVENT_PHASE_LABELS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="top-action-button notification-button"
          aria-label={`Review ${activeIncidentCount} active incidents`}
          onClick={onReviewIncidents}
        >
          <Icon name="bell" />
          <span>{activeIncidentCount}</span>
        </button>
        <div className="supervisor-profile" aria-label="Signed in as Safety Supervisor">
          <span>SS</span>
          <div>
            <strong>Safety Supervisor</strong>
            <small>Unity Stadium · Command 01</small>
          </div>
        </div>
      </div>
    </header>
  );
}

export function GlobalFooter() {
  return (
    <footer className="global-footer">
      <span>
        <span className="brand-mark mini">
          <Icon name="shield" size={16} />
        </span>
        AEGISGRID 2026
      </span>
      <p>
        Decision support for trained stadium safety personnel. Never an autonomous dispatch or
        medical diagnosis system.
      </p>
      <span>Unity Stadium · Synthetic demonstration</span>
    </footer>
  );
}
