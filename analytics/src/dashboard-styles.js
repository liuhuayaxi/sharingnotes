export default `
:root {
  color-scheme: light;
  --bg: #f5f6f8;
  --paper: #fff;
  --ink: #202c39;
  --muted: #718091;
  --line: #e9edf1;
  --green: #147d67;
  --green-light: #e8f4ef;
  --blue: #518bd5;
  --amber: #d29a43;
  --red: #c46565;
  --radius: 18px;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font:
    14px/1.6 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "PingFang SC",
    sans-serif;
}
button,
input,
select {
  font: inherit;
}
button,
a,
input,
select {
  -webkit-tap-highlight-color: transparent;
}
button,
a {
  touch-action: manipulation;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: wait;
  opacity: 0.55;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: 3px solid #96c9bc;
  outline-offset: 4px;
}
button,
input,
select,
.button {
  border: 1px solid #dce3e9;
  border-radius: 9px;
  padding: 8px 13px;
  background: white;
  color: var(--ink);
}
button:hover,
.button:hover {
  background: #f2f6f5;
  border-color: #b6cec7;
}
a {
  color: var(--green);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 30px;
  letter-spacing: -1px;
  font-weight: 680;
}
h2 {
  font-size: 17px;
  letter-spacing: -0.3px;
  font-weight: 650;
}
h3 {
  font-size: 14px;
  font-weight: 600;
}
small,
.muted {
  color: var(--muted);
}
[hidden] {
  display: none !important;
}
.topbar {
  height: 74px;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 max(28px, calc((100vw - 1376px) / 2));
  gap: 20px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 650;
}
.brand-icon {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border-radius: 11px;
  background: var(--green);
  color: white;
  font-size: 15px;
  letter-spacing: -1px;
}
.brand-separator {
  height: 20px;
  border-left: 1px solid var(--line);
  margin: 0 5px;
}
.top-actions {
  display: flex;
  gap: 20px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}
.top-actions details {
  position: relative;
}
.top-actions summary {
  cursor: pointer;
  list-style: none;
}
.account-menu {
  position: absolute;
  right: 0;
  top: 32px;
  width: 280px;
  padding: 18px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 12px 35px #152c3b18;
  z-index: 5;
}
.account-menu button {
  width: 100%;
  margin-bottom: 10px;
}
.account-menu p {
  font-size: 12px;
  margin-bottom: 12px;
}
main {
  max-width: 1432px;
  padding: 35px 28px 60px;
  margin: auto;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 25px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--green);
  font-weight: 700;
  margin-bottom: 5px;
}
.page-heading p {
  color: var(--muted);
  margin-top: 6px;
  font-size: 12px;
}
.heading-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.primary {
  background: var(--green);
  color: white;
  border-color: var(--green);
}
.primary:hover {
  background: #096b57;
  color: white;
}
.filterbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.filters input {
  font-size: 12px;
  padding: 7px 10px;
  max-width: 145px;
}
.filters select {
  font-size: 12px;
}
.filters label {
  font-size: 12px;
  color: var(--muted);
}
#status {
  font-size: 11px;
  color: var(--muted);
}
.banner {
  padding: 13px 16px;
  border: 1px solid #e9d6b4;
  background: #fff9ed;
  border-radius: 10px;
  margin-bottom: 18px;
  color: #856428;
}
.cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}
.metric-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 19px 19px 15px;
  position: relative;
}
.metric-card .metric-label {
  font-size: 12px;
  color: #687788;
  display: flex;
  align-items: center;
  gap: 8px;
}
.metric-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--green);
}
.metric-card:nth-child(2) .metric-dot {
  background: var(--blue);
}
.metric-card:nth-child(3) .metric-dot {
  background: var(--amber);
}
.metric-card:nth-child(4) .metric-dot {
  background: #8e7caf;
}
.metric-card:nth-child(5) .metric-dot {
  background: #7b96ae;
}
.metric-card:nth-child(6) .metric-dot {
  background: var(--red);
}
.metric-card strong {
  display: block;
  font-size: 29px;
  letter-spacing: -1px;
  font-weight: 650;
  margin: 9px 0 4px;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}
.metric-card small {
  font-size: 10px;
}
.panel {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 23px;
  min-width: 0;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 19px;
}
.section-head p {
  color: var(--muted);
  font-size: 11px;
  margin-top: 4px;
}
.section-head .tag {
  white-space: nowrap;
}
.tag {
  font-size: 10px;
  background: #f0f4f6;
  color: #728192;
  padding: 4px 8px;
  border-radius: 5px;
}
.tag.green {
  background: var(--green-light);
  color: var(--green);
}
.segmented {
  background: #f4f6f8;
  padding: 3px;
  border-radius: 8px;
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}
.segmented button {
  padding: 5px 10px;
  border: 0;
  background: transparent;
  font-size: 11px;
  color: var(--muted);
  border-radius: 6px;
}
.segmented button[aria-pressed="true"] {
  background: var(--paper);
  color: var(--green);
  box-shadow: 0 1px 4px #142b3b10;
}
.trend-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 225px;
  gap: 26px;
}
.trend-chart {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.chart-grid {
  stroke: #edf0f3;
  stroke-dasharray: 3 5;
}
.chart-label {
  fill: #8c97a4;
  font-size: 10px;
}
.chart-bar {
  fill: #aed5c9;
  transition: fill 0.15s;
}
.chart-bar.selected {
  fill: var(--green);
}
.chart-hit {
  cursor: pointer;
}
.chart-hit:hover .chart-bar,
.chart-hit:focus .chart-bar {
  fill: #29957c;
}
.chart-no-data {
  fill: #e9edf1;
}
.trend-aside {
  border-left: 1px solid var(--line);
  padding-left: 25px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 23px;
}
.insight-label {
  font-size: 11px;
  color: var(--muted);
}
.insight-value {
  font-size: 23px;
  letter-spacing: -0.6px;
  margin-top: 4px;
  font-weight: 620;
}
.insight-detail {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
}
.legend {
  display: flex;
  gap: 16px;
  font-size: 10px;
  color: var(--muted);
  margin-top: 9px;
}
.legend i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--green);
  margin-right: 6px;
}
.legend .gray {
  background: #e9edf1;
}
.daily-section {
  margin-top: 28px;
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.section-title h2 {
  font-size: 19px;
}
.section-title p {
  color: var(--muted);
  font-size: 11px;
}
.day-rail {
  display: flex;
  gap: 8px;
  overflow: auto;
  scrollbar-width: thin;
  padding: 0 0 12px;
  margin-bottom: 8px;
}
.day-button {
  min-width: 94px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 11px;
  border-color: var(--line);
  flex-shrink: 0;
}
.day-button[aria-pressed="true"] {
  background: var(--green);
  border-color: var(--green);
  color: white;
}
.day-button small {
  display: block;
  font-size: 10px;
}
.day-button[aria-pressed="true"] small {
  color: #c1e0d5;
}
.day-button strong {
  font-size: 15px;
  font-weight: 600;
}
.day-button .day-value {
  font-size: 10px;
  opacity: 0.8;
  margin-top: 4px;
}
.daily-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1fr;
  gap: 22px;
  margin-bottom: 22px;
}
.day-summary .date-heading {
  font-size: 21px;
  margin-bottom: 8px;
}
.day-summary .daily-copy {
  font-size: 12px;
  line-height: 1.9;
  color: #6b7989;
  min-height: 44px;
}
.day-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  border-top: 1px solid var(--line);
  margin-top: 20px;
  padding-top: 18px;
}
.day-metrics strong {
  display: block;
  font-size: 22px;
  font-weight: 630;
  font-variant-numeric: tabular-nums;
}
.day-metrics span {
  font-size: 10px;
  color: var(--muted);
}
.day-highlights {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 18px;
  font-size: 11px;
}
.day-highlights span {
  display: inline-block;
  min-width: 70px;
  color: var(--muted);
}
.hours {
  height: 130px;
  display: flex;
  align-items: flex-end;
  gap: 5px;
  margin-top: 21px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.hour-column {
  height: 100%;
  flex: 1;
  position: relative;
  display: flex;
  align-items: flex-end;
  min-width: 0;
}
.hour-bar {
  width: 100%;
  background: #b4d9ce;
  border-radius: 3px 3px 0 0;
  min-height: 2px;
}
.hour-column.peak .hour-bar {
  background: var(--green);
}
.hour-label {
  position: absolute;
  bottom: -21px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--muted);
}
.empty {
  color: var(--muted);
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
}
.small-caption {
  font-size: 10px;
  color: var(--muted);
  margin-top: 13px;
}
.analysis-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.9fr 0.9fr;
  gap: 20px;
  margin: 22px 0;
}
.rank-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin: 15px 0;
}
.rank-number {
  color: #9da7b2;
  font-size: 11px;
}
.rank-title {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.bar-track {
  height: 5px;
  background: #f0f3f5;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 7px;
}
.bar-fill {
  height: 100%;
  background: var(--green);
  border-radius: 6px;
  min-width: 0;
}
.progress-row {
  display: grid;
  grid-template-columns: 64px 1fr 30px;
  gap: 10px;
  align-items: center;
  font-size: 11px;
  margin: 16px 0;
}
.progress-row .bar-track {
  height: 8px;
  margin: 0;
}
.progress-row:nth-child(2) .bar-fill {
  background: #9bcbbd;
}
.progress-row:nth-child(3) .bar-fill {
  background: #70b5a1;
}
.progress-row:nth-child(4) .bar-fill {
  background: #439b82;
}
.donut-layout {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}
.donut {
  width: 115px;
  height: 115px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.donut-hole {
  background: white;
  width: 85px;
  height: 85px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: 21px;
  font-weight: 650;
}
.donut-hole small {
  font-size: 9px;
  font-weight: 400;
}
.course-legend {
  font-size: 10px;
  min-width: 0;
  flex: 1;
}
.course-legend div {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 9px 0;
}
.course-legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}
.course-legend span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.course-legend strong {
  margin-left: auto;
  font-weight: 500;
  white-space: nowrap;
}
.table-panel {
  margin: 22px 0;
  padding-bottom: 8px;
}
.scroll {
  overflow: auto;
  max-height: 440px;
  scrollbar-width: thin;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
}
td,
th {
  padding: 13px 12px;
  border-bottom: 1px solid #eef1f4;
}
thead th {
  font-size: 10px;
  font-weight: 500;
  color: #8995a3;
  background: #fafbfc;
  position: sticky;
  top: 0;
  z-index: 1;
}
tbody tr:last-child td {
  border-bottom: 0;
}
tbody tr:hover {
  background: #fafcfb;
}
td.number,
th.number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
td.title-cell {
  white-space: normal;
  min-width: 230px;
  max-width: 440px;
}
.title-cell small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
}
.table-button {
  border: 0;
  background: transparent;
  color: var(--green);
  padding: 0;
  text-align: left;
  font-size: 11px;
}
.selected-row {
  background: #edf7f2 !important;
}
.table-foot {
  font-size: 10px;
  color: var(--muted);
  padding: 12px 0;
}
.search {
  min-width: 200px;
  font-size: 11px;
  padding: 6px 10px;
}
.visitor-avatar {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  background: #edf4f1;
  color: var(--green);
  margin-right: 9px;
  font-size: 10px;
}
.visitor-id {
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.visitor-table td:first-child {
  min-width: 185px;
}
.event-kind {
  display: inline-block;
  background: #f0f4f7;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.event-kind.focus {
  background: #e9f4ee;
  color: var(--green);
}
.event-kind.error {
  background: #fceeee;
  color: var(--red);
}
.event-note {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.load-more {
  display: block;
  margin: 15px auto;
  font-size: 11px;
}
.environment-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}
.distribution {
  margin-top: 15px;
}
.distribution-row {
  margin: 11px 0;
  font-size: 11px;
}
.distribution-row header {
  display: flex;
  justify-content: space-between;
  color: #657486;
}
.distribution-row .bar-fill {
  background: #7b9eb5;
}
.diagnostic-details {
  margin-top: 20px;
}
.diagnostic-details > summary {
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  padding: 12px 0;
}
.ua {
  white-space: normal;
  min-width: 190px;
  max-width: 350px;
  overflow-wrap: anywhere;
  font-size: 10px;
}
.footer {
  display: flex;
  justify-content: space-between;
  color: #929daa;
  font-size: 10px;
  margin-top: 28px;
}
.loading .metric-card strong {
  color: #b9c3cb;
}
.login-main {
  min-height: 85vh;
  display: grid;
  place-items: center;
}
.login-card {
  width: min(440px, 100%);
  padding: 38px;
}
.login-card h1 {
  font-size: 25px;
  margin-top: 20px;
}
.login-card p {
  font-size: 12px;
  color: var(--muted);
  margin: 10px 0 22px;
}
.login-card label {
  display: block;
  font-size: 12px;
  margin: 22px 0 8px;
}
.login-card input {
  width: 100%;
  margin: 8px 0 16px;
}
.login-card button {
  width: 100%;
}
.login-card .login-error {
  color: var(--red);
}
.metric-card .metric-unit {
  font-size: 12px;
  letter-spacing: 0;
  font-weight: 400;
  margin-left: 6px;
  color: var(--muted);
}
@media (max-width: 1150px) {
  .cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .analysis-grid {
    grid-template-columns: 1fr 1fr;
  }
  .analysis-grid .panel:first-child {
    grid-column: 1/-1;
  }
  .trend-layout {
    grid-template-columns: 1fr 180px;
  }
}
@media (max-width: 750px) {
  .topbar {
    height: 62px;
    padding: 0 18px;
  }
  .brand {
    font-size: 13px;
  }
  .brand-separator,
  .brand-subtitle,
  .top-actions > a {
    display: none;
  }
  .top-actions {
    gap: 12px;
  }
  main {
    padding: 23px 16px 35px;
  }
  h1 {
    font-size: 26px;
  }
  .page-heading {
    align-items: flex-start;
    gap: 12px;
  }
  .heading-actions {
    gap: 7px;
  }
  .heading-actions a {
    display: none;
  }
  .heading-actions button {
    font-size: 11px;
  }
  .filterbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .filters {
    gap: 7px;
  }
  .filters input {
    max-width: 130px;
    font-size: 11px;
  }
  .filters select {
    font-size: 11px;
  }
  .cards {
    gap: 9px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric-card {
    padding: 15px;
  }
  .metric-card strong {
    font-size: 25px;
  }
  .panel {
    padding: 18px;
    border-radius: 14px;
  }
  .section-head {
    flex-wrap: wrap;
    gap: 12px;
  }
  .trend-layout {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  .trend-aside {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding: 15px 0 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  .trend-aside > div:last-child {
    display: none;
  }
  .insight-value {
    font-size: 20px;
  }
  .daily-overview,
  .analysis-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .analysis-grid .panel:first-child {
    grid-column: auto;
  }
  .day-metrics {
    gap: 6px;
  }
  .day-metrics strong {
    font-size: 20px;
  }
  .day-button {
    min-width: 85px;
  }
  .donut-layout {
    justify-content: center;
  }
  .course-legend {
    max-width: 230px;
  }
  .environment-grid {
    gap: 18px;
  }
  .section-title {
    gap: 12px;
  }
  .section-title h2 {
    font-size: 18px;
  }
  .section-title p {
    font-size: 10px;
  }
  .search {
    min-width: 150px;
    width: 100%;
  }
  .footer {
    flex-direction: column;
    gap: 5px;
  }
  .table-panel {
    margin: 16px 0;
  }
  .section-head > input {
    max-width: 100%;
  }
  .hour-label {
    font-size: 8px;
  }
  .hours {
    gap: 4px;
  }
  .table-panel .scroll {
    max-height: 350px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
`;
