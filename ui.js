const $ = (selector) => document.querySelector(selector);
const PALETTE = { sexual: '#4f88a3', asexual: '#d87858', parasite: '#4f8a70', locus3: '#b49a3b', grid: '#d8d9ce', ink: '#17312f', muted: '#6f7770' };
const controls = {
  graceYears: $('#graceYears'), runYears: $('#runYears'), hostPopulation: $('#hostPopulation'), parasitePopulation: $('#parasitePopulation'),
  parasiteSpecies: $('#parasiteSpecies'), lociPerSpecies: $('#lociPerSpecies'), recombination: $('#recombination'),
  hostMortality: $('#hostMortality'), parasiteMortality: $('#parasiteMortality'), hostMutation: $('#hostMutation'), parasiteMutation: $('#parasiteMutation'),
  environmentalSD: $('#environmentalSD'),
};
const state = { running: false, cancelled: false, summaries: [] };

function fmtPercent(value) { return `${(value * 100).toFixed(value > 0.995 || value < 0.005 ? 1 : 0)}%`; }
function updateOutputs() {
  $('#parasiteSpeciesOut').textContent = controls.parasiteSpecies.value;
  $('#lociPerSpeciesOut').textContent = controls.lociPerSpecies.value;
  $('#recombinationOut').textContent = Number(controls.recombination.value).toFixed(2).replace('.', ',');
  $('#hostMortalityOut').textContent = Number(controls.hostMortality.value).toFixed(3).replace('.', ',');
  $('#parasiteMortalityOut').textContent = Number(controls.parasiteMortality.value).toFixed(3).replace('.', ',');
}
Object.values(controls).forEach((control) => control.addEventListener('input', () => {
  updateOutputs();
}));

function randomSeed() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values[0] = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  return values[0] || 1;
}

function optionsFor(seed) {
  return {
    ...PAPER_DEFAULTS,
    graceYears: Number(controls.graceYears.value), runYears: Number(controls.runYears.value),
    hostPopulation: Number(controls.hostPopulation.value), parasitePopulation: Number(controls.parasitePopulation.value),
    parasiteSpecies: Number(controls.parasiteSpecies.value), lociPerSpecies: Number(controls.lociPerSpecies.value),
    hostMortality: Number(controls.hostMortality.value), parasiteMortality: Number(controls.parasiteMortality.value),
    recombination: Number(controls.recombination.value), hostMutation: Number(controls.hostMutation.value), parasiteMutation: Number(controls.parasiteMutation.value),
    environmentalSD: Number(controls.environmentalSD.value),
    seed,
  };
}

function setProgress(done, total, message) {
  const pct = total ? done / total * 100 : 0;
  $('#progressBar').style.width = `${pct}%`;
  $('#progressText').textContent = `${Math.round(pct)}%`;
  $('#statusText').textContent = message;
}

function canvasContext(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const cssHeight = Number(canvas.getAttribute('height')) / Number(canvas.getAttribute('width')) * rect.width;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(cssHeight * ratio));
  canvas.style.height = `${cssHeight}px`;
  return { ctx: canvas.getContext('2d'), width: canvas.width, height: canvas.height, ratio };
}

function drawLine(ctx, values, x, y, color, lineWidth) {
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); let active = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) { active = false; return; }
    if (!active) { ctx.moveTo(x(index), y(value)); active = true; } else ctx.lineTo(x(index), y(value));
  });
  ctx.stroke();
}

function drawChart(canvas, series, { yMax = 1, yTicks = 4, emptyText = 'Os resultados aparecerão aqui' } = {}) {
  const { ctx, width, height, ratio } = canvasContext(canvas);
  ctx.clearRect(0, 0, width, height);
  const margin = { left: 48 * ratio, right: 12 * ratio, top: 12 * ratio, bottom: 34 * ratio };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  ctx.font = `${10 * ratio}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = yMax * (1 - tick / yTicks);
    const yPos = margin.top + plotHeight * tick / yTicks;
    ctx.strokeStyle = PALETTE.grid; ctx.lineWidth = ratio;
    ctx.beginPath(); ctx.moveTo(margin.left, yPos); ctx.lineTo(width - margin.right, yPos); ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'right';
    ctx.fillText(yMax <= 1 ? value.toFixed(1) : String(Math.round(value)), margin.left - 9 * ratio, yPos);
  }
  const length = Math.max(0, ...series.map((item) => item.values.length));
  if (!length) {
    ctx.fillStyle = PALETTE.muted; ctx.textAlign = 'center'; ctx.font = `${12 * ratio}px Inter, system-ui, sans-serif`;
    ctx.fillText(emptyText, margin.left + plotWidth / 2, margin.top + plotHeight / 2);
    return;
  }
  const x = (index) => margin.left + index / Math.max(1, length - 1) * plotWidth;
  const y = (value) => margin.top + (1 - Math.max(0, Math.min(yMax, value)) / yMax) * plotHeight;
  series.forEach((item) => drawLine(ctx, item.values, x, y, item.color, 2 * ratio));
  ctx.fillStyle = PALETTE.muted; ctx.textAlign = 'center'; ctx.font = `${10 * ratio}px Inter, system-ui, sans-serif`;
  [0, Math.floor((length - 1) / 2), length - 1].forEach((index) => ctx.fillText(String(index), x(index), height - 12 * ratio));
}

function drawHostGrid(modes = []) {
  const canvas = $('#hostGrid'); const { ctx, width, height, ratio } = canvasContext(canvas); ctx.clearRect(0, 0, width, height);
  if (!modes.length) {
    ctx.fillStyle = PALETTE.muted; ctx.textAlign = 'center'; ctx.font = `${12 * ratio}px Inter, system-ui, sans-serif`;
    ctx.fillText('A população final aparecerá aqui', width / 2, height / 2); return;
  }
  const columns = 20; const rows = Math.ceil(modes.length / columns); const pad = 18 * ratio;
  const cellW = (width - pad * 2) / columns; const cellH = (height - pad * 2) / rows; const radius = Math.min(cellW, cellH) * .28;
  modes.forEach((mode, index) => {
    const column = index % columns; const row = Math.floor(index / columns);
    ctx.fillStyle = mode === 1 ? PALETTE.sexual : PALETTE.asexual;
    ctx.beginPath(); ctx.arc(pad + cellW * (column + .5), pad + cellH * (row + .5), radius, 0, Math.PI * 2); ctx.fill();
  });
}

function renderCharts(liveSummary = null) {
  const first = liveSummary || state.summaries[0];
  drawChart($('#sexChart'), first ? [
    { values: first.history.map((row) => row.sexualCount), color: PALETTE.sexual },
    { values: first.history.map((row) => row.asexualCount), color: PALETTE.asexual },
  ] : [], { yMax: first?.hostPopulation || Number(controls.hostPopulation.value) || PAPER_DEFAULTS.hostPopulation });
  drawChart($('#fitnessChart'), first ? [
    { values: first.history.map((row) => row.fitnessSexual), color: PALETTE.sexual },
    { values: first.history.map((row) => row.fitnessAsexual), color: PALETTE.asexual },
    { values: first.history.map((row) => row.fitnessParasite), color: PALETTE.parasite },
  ] : [], { yMax: 1 });
  drawChart($('#alleleChart'), first ? [0, 1, 2].map((locus, index) => ({
    values: first.history.map((row) => row.alleleFrequencies[locus] ?? null),
    color: [PALETTE.sexual, PALETTE.asexual, PALETTE.locus3][index],
  })) : [], { yMax: 1 });
  drawHostGrid(first?.hostModes || []);
}

function renderResults() {
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanSex = average(state.summaries.map((summary) => summary.meanSexLast50));
  $('#meanSex').textContent = fmtPercent(meanSex);
  $('#finalSex').textContent = fmtPercent(average(state.summaries.map((summary) => summary.finalSexShare)));
  $('#outcomeLabel').textContent = meanSex > .8 ? 'sexo resiste à invasão' : meanSex < .2 ? 'clones dominam' : 'coexistência ou transição';
  $('#runSummary').innerHTML = `<span class="replicate-pill">Simulação concluída · <b>${fmtPercent(meanSex)} de reprodução sexuada</b></span>`;
  $('#downloadButton').disabled = false;
  renderCharts();
}

async function run() {
  if (state.running) { state.cancelled = true; return; }
  state.running = true; state.cancelled = false; state.summaries = [];
  $('#runSummary').innerHTML = '<p class="empty-state">Simulação em andamento…</p>';
  $('#downloadButton').disabled = true;
  $('#runButton').innerHTML = '<span class="run-dot"></span>Interromper';
  const totalSteps = Number(controls.runYears.value) + Number(controls.graceYears.value); let done = 0;
  const simulation = new HamiltonSimulation(optionsFor(randomSeed()));
  while (!simulation.isFinished() && !state.cancelled) {
    for (let batch = 0; batch < 4 && !simulation.isFinished(); batch += 1) { simulation.step(); done += 1; }
    setProgress(done, totalSteps, `Ano ${Math.max(0, simulation.year)}`);
    renderCharts({
      history: simulation.history,
      hostPopulation: simulation.options.hostPopulation,
      hostModes: simulation.hosts.map((host) => host.genome[0]),
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  if (!state.cancelled) state.summaries.push(simulation.summary());
  state.running = false; $('#runButton').innerHTML = '<span class="run-dot"></span>Executar novamente';
  if (state.cancelled) setProgress(done, totalSteps, 'Simulação interrompida');
  else { setProgress(totalSteps, totalSteps, 'Simulação concluída'); renderResults(); }
}

$('#runButton').addEventListener('click', run);
$('#resetButton').addEventListener('click', () => {
  state.cancelled = true; state.summaries = [];
  $('#meanSex').textContent = $('#finalSex').textContent = '—'; $('#outcomeLabel').textContent = 'execute para observar';
  $('#runSummary').innerHTML = '<p class="empty-state">Execute a simulação para gerar os dados.</p>';
  $('#downloadButton').disabled = true; setProgress(0, 1, 'Pronto para iniciar'); renderCharts();
});
$('#downloadButton').addEventListener('click', () => {
  if (!state.summaries.length) return;
  const blob = new Blob([simulationToCSV(state.summaries[0])], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'hamilton-1990-simulacao.csv'; link.click(); URL.revokeObjectURL(link.href);
});
document.querySelectorAll('.info').forEach((button) => {
  const tooltip = $('#tooltip');
  button.addEventListener('mouseenter', () => { const rect = button.getBoundingClientRect(); tooltip.textContent = button.dataset.tip; tooltip.style.display = 'block'; tooltip.style.left = `${Math.min(window.innerWidth - 245, rect.left)}px`; tooltip.style.top = `${rect.bottom + 7}px`; });
  button.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
});
window.addEventListener('resize', renderCharts);
updateOutputs(); renderCharts();
