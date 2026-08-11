"use strict";

const COLORS = { ink: "#17312f", muted: "#687774", grid: "#d8d9ce", blue: "#317f9e", coral: "#e76f51", green: "#2e8b68" };
const DEFAULTS = { grace_period: 200, n_gen: 400, H: 200, n_paras: 12, k: 1, P: 200, d: 0.07, dp: 0.9, m_host: 0.0001, m_paras: 0.0001, r: 0.5 };
const state = {
  hosts: null, parasites: null, currentGen: 0, totalGen: 0,
  sexualCounts: [], asexualCounts: [], parasiteCounts: [],
  uniqueHostGenotypesSexual: [], uniqueHostGenotypesAsexual: [],
  uniqueParasiteGenotypes: [], fitnessSexual: [], fitnessAsexual: [], fitnessParasite: [],
  params: null, running: false, runToken: 0
};

const $ = (selector) => document.querySelector(selector);
const randomBit = () => Math.random() < 0.5 ? 0 : 1;
const randomItem = (array) => array[Math.floor(Math.random() * array.length)];

// Equivalente a round() do R para os valores não negativos usados pelo modelo.
function rRound(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, Math.abs(value)) * 4) {
    return lower % 2 === 0 ? lower : lower + 1;
  }
  return fraction < 0.5 ? lower : lower + 1;
}

function sampleWithoutReplacement(array, size) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

function createHost(nParas, k) {
  const genotype = [0];
  for (let i = 0; i < nParas * k; i++) genotype.push(randomBit());
  return genotype;
}

function createParasite(k) {
  return Array.from({ length: k }, randomBit);
}

function mutateGenotype(genotype, mutationRate) {
  const mutated = genotype.slice();
  for (let i = 0; i < mutated.length; i++) {
    if (Math.random() < mutationRate) mutated[i] = 1 - mutated[i];
  }
  return mutated;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function recombine(parent1, parent2, recombinationRate) {
  const child = new Array(parent1.length).fill(0);
  child[0] = 1;
  let donor = Math.random() < 0.5 ? parent1 : parent2;
  child[1] = donor[1];
  // O laço começa novamente no primeiro locus de defesa, como no código R original.
  for (let locus = 1; locus < child.length; locus++) {
    if (Math.random() < recombinationRate) donor = arraysEqual(donor, parent1) ? parent2 : parent1;
    child[locus] = donor[locus];
  }
  return child;
}

function descendingIndices(values, survivorCount) {
  const ordered = values.map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  // Em R, 1:0 produz c(1, 0); o índice zero é ignorado e o primeiro item permanece.
  return ordered.slice(0, survivorCount === 0 ? 1 : survivorCount).map(item => item.index);
}

// Tradução direta de simulateGeneration(): as quatro etapas e sua ordem foram preservadas.
function simulateGeneration(hosts, parasites, params) {
  const { H, n_paras: nParas, k, P, d, dp, m_host: hostMutation, m_paras: parasiteMutation, r } = params;
  const deadHosts = rRound(H * d);
  const deadParasites = rRound(P * dp);

  const hostScores = new Array(H).fill(0);
  for (let i = 0; i < H; i++) {
    const genotype = hosts[i];
    let totalScore = 0;
    for (let j = 0; j < nParas; j++) {
      const start = 1 + j * k;
      const parasite = randomItem(parasites[j]);
      for (let locus = 0; locus < k; locus++) totalScore += genotype[start + locus] === parasite[locus] ? 1 : 0;
    }
    hostScores[i] = totalScore;
  }

  const sexualIndices = [];
  const asexualIndices = [];
  hosts.forEach((host, index) => (host[0] === 1 ? sexualIndices : asexualIndices).push(index));
  const averageFor = indices => indices.length ? indices.reduce((sum, index) => sum + hostScores[index], 0) / indices.length : NaN;
  const maxHostFitness = nParas * k;
  const relativeSexualFitness = averageFor(sexualIndices) / maxHostFitness;
  const relativeAsexualFitness = averageFor(asexualIndices) / maxHostFitness;

  const survivors = descendingIndices(hostScores, H - deadHosts).map(index => hosts[index]);
  const asexualSurvivors = survivors.filter(host => host[0] === 0);
  const sexualSurvivors = survivors.filter(host => host[0] === 1);
  const numberAsexual = asexualSurvivors.length;
  const numberSexual = sexualSurvivors.length;
  const totalWeight = numberAsexual + numberSexual * 0.5;
  const asexualOffspringCount = rRound(deadHosts * numberAsexual / totalWeight);
  const sexualOffspringCount = deadHosts - asexualOffspringCount;
  const offspring = [];

  if (asexualOffspringCount > 0 && numberAsexual > 0) {
    for (let n = 0; n < asexualOffspringCount; n++) {
      const child = mutateGenotype(randomItem(asexualSurvivors), hostMutation);
      child[0] = 0;
      offspring.push(child);
    }
  }
  if (sexualOffspringCount > 0 && numberSexual >= 2) {
    for (let n = 0; n < sexualOffspringCount; n++) {
      const child = recombine(randomItem(sexualSurvivors), randomItem(sexualSurvivors), r);
      for (let locus = 1; locus < child.length; locus++) {
        if (Math.random() < hostMutation) child[locus] = 1 - child[locus];
      }
      offspring.push(child);
    }
  }

  let nextHosts = survivors.concat(offspring);
  if (nextHosts.length > H) {
    nextHosts = sampleWithoutReplacement(nextHosts, H);
  } else if (nextHosts.length < H) {
    const extras = [];
    for (let n = 0; n < H - nextHosts.length; n++) {
      const parent = randomItem(survivors);
      const child = mutateGenotype(parent, hostMutation);
      child[0] = parent[0];
      extras.push(child);
    }
    nextHosts = nextHosts.concat(extras);
  }

  const averageParasiteSpecies = new Array(nParas).fill(0);
  const nextParasites = new Array(nParas);
  for (let j = 0; j < nParas; j++) {
    const parasiteScores = new Array(P).fill(0);
    for (let p = 0; p < P; p++) {
      const parasiteGenotype = parasites[j][p];
      const host = randomItem(nextHosts);
      const start = 1 + j * k;
      for (let locus = 0; locus < k; locus++) parasiteScores[p] += host[start + locus] === parasiteGenotype[locus] ? 1 : 0;
    }
    averageParasiteSpecies[j] = parasiteScores.reduce((sum, score) => sum + score, 0) / P;
    const parasiteSurvivors = descendingIndices(parasiteScores, P - deadParasites).map(index => parasites[j][index]);
    const parasiteOffspring = [];
    const missingParasites = P - parasiteSurvivors.length;
    // Preserva a semântica de `for (n in 1:0)` do R, que executa duas iterações.
    const reproductionIterations = missingParasites === 0 ? 2 : missingParasites;
    for (let n = 0; n < reproductionIterations; n++) {
      parasiteOffspring.push(mutateGenotype(randomItem(parasiteSurvivors), parasiteMutation));
    }
    nextParasites[j] = parasiteSurvivors.concat(parasiteOffspring);
  }

  const parasiteFitness = averageParasiteSpecies.reduce((sum, value) => sum + value, 0) / nParas / k;
  const sexualCount = nextHosts.reduce((sum, host) => sum + (host[0] === 1 ? 1 : 0), 0);
  return {
    hosts: nextHosts, parasites: nextParasites, sexualCount, asexualCount: H - sexualCount,
    fitnessSexual: relativeSexualFitness, fitnessAsexual: relativeAsexualFitness, fitnessParasite: parasiteFitness
  };
}

function readParams() {
  const integer = id => Math.trunc(Number($("#" + id).value));
  const decimal = id => Number($("#" + id).value);
  return {
    H: integer("H"), n_paras: integer("n_paras"), k: integer("k"), P: integer("P"),
    d: decimal("d"), dp: decimal("dp"), m_host: decimal("m_host"),
    m_paras: decimal("m_paras"), r: decimal("r"), n_gen: integer("n_gen"), grace_period: integer("grace_period")
  };
}

function validParams(params) {
  return Object.values(params).every(Number.isFinite) && params.H > 0 && params.n_paras > 0 && params.k > 0 && params.P > 0 && params.n_gen >= 0 && params.grace_period >= 0;
}

function startSimulation() {
  const params = readParams();
  if (!validParams(params)) {
    $("#status").textContent = "Revise os parâmetros antes de iniciar";
    return;
  }
  state.runToken += 1;
  const token = state.runToken;
  state.params = params;
  state.totalGen = params.grace_period + params.n_gen;
  state.currentGen = 0;
  state.sexualCounts = new Array(state.totalGen).fill(0);
  state.asexualCounts = new Array(state.totalGen).fill(0);
  state.parasiteCounts = Array.from({ length: state.totalGen }, () => new Array(params.n_paras).fill(NaN));
  state.uniqueHostGenotypesSexual = new Array(state.totalGen).fill(0);
  state.uniqueHostGenotypesAsexual = new Array(state.totalGen).fill(0);
  state.fitnessSexual = new Array(state.totalGen).fill(NaN);
  state.fitnessAsexual = new Array(state.totalGen).fill(NaN);
  state.fitnessParasite = new Array(state.totalGen).fill(NaN);
  state.uniqueParasiteGenotypes = Array.from({ length: params.n_paras }, () => new Array(state.totalGen).fill(0));
  state.hosts = Array.from({ length: params.H }, () => createHost(params.n_paras, params.k));
  state.parasites = Array.from({ length: params.n_paras }, () => Array.from({ length: params.P }, () => createParasite(params.k)));
  state.running = true;
  $("#start").innerHTML = '<span aria-hidden="true">↻</span> Reiniciar simulação';
  $("#downloadData").disabled = true;
  $("#statusDot").className = "status-dot running";
  updateStatus();
  drawAll();
  setTimeout(() => runGeneration(token), 50);
}

function runGeneration(token) {
  if (!state.running || token !== state.runToken) return;
  if (state.currentGen >= state.totalGen) {
    state.running = false;
    $("#statusDot").className = "status-dot done";
    $("#status").textContent = "Simulação concluída";
    $("#downloadData").disabled = false;
    return;
  }

  const result = simulateGeneration(state.hosts, state.parasites, state.params);
  state.hosts = result.hosts;
  state.parasites = result.parasites;
  state.currentGen += 1;
  const index = state.currentGen - 1;
  state.sexualCounts[index] = result.sexualCount;
  state.asexualCounts[index] = result.asexualCount;
  state.fitnessSexual[index] = result.fitnessSexual;
  state.fitnessAsexual[index] = result.fitnessAsexual;
  state.fitnessParasite[index] = result.fitnessParasite;

  const sexualHosts = state.hosts.filter(host => host[0] === 1);
  const asexualHosts = state.hosts.filter(host => host[0] === 0);
  state.uniqueHostGenotypesSexual[index] = new Set(sexualHosts.map(host => host.join("-"))).size;
  state.uniqueHostGenotypesAsexual[index] = new Set(asexualHosts.map(host => host.join("-"))).size;
  for (let j = 0; j < state.params.n_paras; j++) {
    state.parasiteCounts[index][j] = state.parasites[j].length;
    state.uniqueParasiteGenotypes[j][index] = new Set(state.parasites[j].map(parasite => parasite.join("-"))).size;
  }

  // Desenha antes da troca, na mesma posição em que as mensagens eram enviadas pelo Shiny.
  drawAll();
  if (state.currentGen === state.params.grace_period) {
    const numberToSwitch = rRound(state.params.H / 2);
    const indices = sampleWithoutReplacement(Array.from({ length: state.params.H }, (_, i) => i), numberToSwitch);
    indices.forEach(i => { state.hosts[i][0] = 1; });
    const sexualNow = state.hosts.reduce((sum, host) => sum + (host[0] === 1 ? 1 : 0), 0);
    state.sexualCounts[index] = sexualNow;
    state.asexualCounts[index] = state.params.H - sexualNow;
  }
  updateStatus();
  $("#downloadData").disabled = false;
  setTimeout(() => runGeneration(token), 50);
}

function updateStatus() {
  const current = state.currentGen;
  const total = state.totalGen;
  const index = current - 1;
  if (current === 0) {
    $("#status").textContent = "Preparando a primeira geração";
  } else {
    $("#status").textContent = `Geração ${current} · Sexuais: ${state.sexualCounts[index]} · Assexuais: ${state.asexualCounts[index]}`;
  }
  $("#progressText").textContent = `${current} / ${total} gerações`;
  $("#progressBar").style.width = `${total ? current / total * 100 : 0}%`;
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawEmpty(context, width, height, text) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.muted;
  context.font = "13px Manrope, sans-serif";
  context.textAlign = "center";
  context.fillText(text, width / 2, height / 2);
}

function drawLineChart(canvas, series, yMax, yLabel) {
  const { context: ctx, width, height } = setupCanvas(canvas);
  const length = state.currentGen;
  if (!length) return drawEmpty(ctx, width, height, "Os resultados aparecerão aqui");
  ctx.clearRect(0, 0, width, height);
  const margin = { top: 18, right: 16, bottom: 45, left: 54 };
  const chartWidth = Math.max(1, width - margin.left - margin.right);
  const chartHeight = Math.max(1, height - margin.top - margin.bottom);
  const x = generation => margin.left + (length === 1 ? 0 : (generation - 1) / (length - 1) * chartWidth);
  const y = value => margin.top + chartHeight - value / yMax * chartHeight;

  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = COLORS.muted;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const value = yMax * i / 5;
    const yPos = y(value);
    ctx.beginPath(); ctx.moveTo(margin.left, yPos); ctx.lineTo(width - margin.right, yPos); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(yMax === 1 ? value.toFixed(1) : String(Math.round(value)), margin.left - 8, yPos + 3);
  }
  const ticks = Math.min(6, Math.max(1, length - 1));
  for (let i = 0; i <= ticks; i++) {
    const generation = length === 1 ? 1 : 1 + i * (length - 1) / ticks;
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(generation)), x(generation), height - margin.bottom + 17);
  }
  ctx.fillStyle = COLORS.ink;
  ctx.font = "11px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Geração", margin.left + chartWidth / 2, height - 7);
  ctx.save();
  ctx.translate(12, margin.top + chartHeight / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();

  if (state.params.grace_period > 0 && state.params.grace_period <= length) {
    const xPos = x(state.params.grace_period);
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = COLORS.ink;
    ctx.beginPath(); ctx.moveTo(xPos, margin.top); ctx.lineTo(xPos, margin.top + chartHeight); ctx.stroke(); ctx.restore();
  }

  series.forEach(({ values, color }) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i < length; i++) {
      const value = values[i];
      if (!Number.isFinite(value)) { drawing = false; continue; }
      if (!drawing) { ctx.moveTo(x(i + 1), y(value)); drawing = true; }
      else ctx.lineTo(x(i + 1), y(value));
    }
    ctx.stroke();
  });
}

function drawHostGrid() {
  const canvas = $("#hostGridCanvas");
  const { context: ctx, width, height } = setupCanvas(canvas);
  if (!state.hosts) return drawEmpty(ctx, width, height, "A população aparecerá aqui");
  ctx.clearRect(0, 0, width, height);
  const gridSize = Math.ceil(Math.sqrt(state.params.H));
  const gap = state.params.H > 500 ? 1 : 2;
  const cellWidth = width / gridSize;
  const cellHeight = height / gridSize;
  state.hosts.forEach((host, index) => {
    const left = index % gridSize * cellWidth;
    const top = Math.floor(index / gridSize) * cellHeight;
    ctx.fillStyle = host[0] === 1 ? COLORS.blue : COLORS.coral;
    ctx.fillRect(left + gap / 2, top + gap / 2, Math.max(0, cellWidth - gap), Math.max(0, cellHeight - gap));
  });
}

function drawAll() {
  drawLineChart($("#simChartCanvas"), [
    { values: state.sexualCounts, color: COLORS.blue },
    { values: state.asexualCounts, color: COLORS.coral }
  ], state.params ? state.params.H : 1, "Número de indivíduos");
  drawLineChart($("#fitnessChartCanvas"), [
    { values: state.fitnessSexual, color: COLORS.blue },
    { values: state.fitnessAsexual, color: COLORS.coral },
    { values: state.fitnessParasite, color: COLORS.green }
  ], 1, "Fitness relativo");
  drawHostGrid();
}

function downloadCsv() {
  if (!state.currentGen) return;
  const rows = [["Geracao", "Sexuais", "Assexuais", "Fitness_Sexuais_Relativo", "Fitness_Assexuais_Relativo", "Fitness_Parasitas_Relativo"]];
  for (let i = 0; i < state.currentGen; i++) {
    const csvValue = value => Number.isNaN(value) ? "NA" : value;
    rows.push([i + 1, state.sexualCounts[i], state.asexualCounts[i], csvValue(state.fitnessSexual[i]), csvValue(state.fitnessAsexual[i]), csvValue(state.fitnessParasite[i])]);
  }
  const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `simulacao_${date}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(button => {
    const active = button === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    const active = panel.id === tab.dataset.tab;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  if (tab.dataset.tab === "simulacao") requestAnimationFrame(drawAll);
}));

const rangeDigits = { d: 2, dp: 2, m_host: 4, m_paras: 4, r: 2 };
Object.entries(rangeDigits).forEach(([id, digits]) => {
  const input = $("#" + id);
  const refresh = () => $("#" + id + "Value").value = Number(input.value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  input.addEventListener("input", refresh);
  refresh();
});

$("#resetDefaults").addEventListener("click", () => {
  Object.entries(DEFAULTS).forEach(([id, value]) => { $("#" + id).value = value; $("#" + id).dispatchEvent(new Event("input")); });
});
$("#start").addEventListener("click", startSimulation);
$("#downloadData").addEventListener("click", downloadCsv);
window.addEventListener("resize", drawAll);
drawAll();
