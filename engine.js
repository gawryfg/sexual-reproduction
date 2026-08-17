const PAPER_DEFAULTS = Object.freeze({
  hostPopulation: 200,
  parasitePopulation: 200,
  parasiteSpecies: 12,
  lociPerSpecies: 1,
  recombination: 0.3,
  hostMutation: 0.0001,
  parasiteMutation: 0.01,
  hostMortality: 1 / 14,
  parasiteMortality: 0.909,
  juvenileYears: 13,
  graceYears: 70,
  runYears: 400,
  initialSexualShare: 0.5,
  environmentalSD: 0,
  seed: 1990,
});

class SeededRandom {
  constructor(seed = 1990) {
    this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
    this.hasSpare = false;
    this.spare = 0;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(max) {
    return Math.floor(this.next() * max);
  }

  normal() {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    this.hasSpare = true;
    return mag * Math.cos(2 * Math.PI * v);
  }

  shuffle(values) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
}

function flipMutations(genome, rate, random) {
  const result = genome.slice();
  if (rate <= 0) return result;
  for (let i = 0; i < result.length; i += 1) {
    if (random.next() < rate) result[i] = result[i] ? 0 : 1;
  }
  return result;
}

function randomGenome(length, random) {
  return Array.from({ length }, () => (random.next() < 0.5 ? 0 : 1));
}

function crossover(a, b, rate, random) {
  const child = new Array(a.length);
  let source = random.next() < 0.5 ? 0 : 1;
  for (let locus = 0; locus < a.length; locus += 1) {
    child[locus] = source === 0 ? a[locus] : b[locus];
    if (locus < a.length - 1 && random.next() < rate) source = 1 - source;
  }
  return child;
}

function weightedChoice(items, weight, random) {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return items[random.int(items.length)];
  let target = random.next() * total;
  for (const item of items) {
    target -= Math.max(0, weight(item));
    if (target <= 0) return item;
  }
  return items[items.length - 1];
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

class HamiltonSimulation {
  constructor(options = {}) {
    this.options = { ...PAPER_DEFAULTS, ...options };
    this.random = new SeededRandom(this.options.seed);
    this.resistanceLength = this.options.parasiteSpecies * this.options.lociPerSpecies;
    this.hostGenomeLength = 1 + this.resistanceLength;
    this.hostDeaths = Math.min(this.options.hostPopulation - 1, Math.max(0, Math.round(this.options.hostPopulation * this.options.hostMortality)));
    this.parasiteDeaths = Math.min(this.options.parasitePopulation - 1, Math.max(0, Math.round(this.options.parasitePopulation * this.options.parasiteMortality)));
    this.year = -this.options.graceYears;
    this.sexIntroduced = false;
    this.history = [];
    this.hosts = Array.from({ length: this.options.hostPopulation }, () => ({
      age: this.random.int(40),
      genome: [0, ...randomGenome(this.resistanceLength, this.random)],
      score: 0,
      matches: 0,
    }));
    this.parasites = Array.from({ length: this.options.parasiteSpecies }, () =>
      Array.from({ length: this.options.parasitePopulation }, () => ({
        genome: randomGenome(this.options.lociPerSpecies, this.random),
        score: 0,
      })),
    );
  }

  introduceSex() {
    const target = Math.round(this.hosts.length * this.options.initialSexualShare);
    for (const host of this.hosts) host.genome[0] = 0;
    const order = this.random.shuffle(Array.from({ length: this.hosts.length }, (_, i) => i));
    for (let i = 0; i < target; i += 1) this.hosts[order[i]].genome[0] = 1;
    this.sexIntroduced = true;
  }

  infectAndScore() {
    const parasiteFitnessBySpecies = [];
    for (const host of this.hosts) {
      host.score = 0;
      host.matches = 0;
    }

    for (let species = 0; species < this.options.parasiteSpecies; species += 1) {
      const population = this.parasites[species];
      const parasiteOrder = this.random.shuffle(Array.from({ length: population.length }, (_, i) => i));
      const assignments = Array.from({ length: this.hosts.length }, (_, i) => parasiteOrder[i % population.length]);
      const exposures = Array(population.length).fill(0);
      for (const parasite of population) parasite.score = 0;
      const offset = 1 + species * this.options.lociPerSpecies;
      for (let hostIndex = 0; hostIndex < this.hosts.length; hostIndex += 1) {
        const host = this.hosts[hostIndex];
        const parasite = population[assignments[hostIndex]];
        let matches = 0;
        for (let locus = 0; locus < this.options.lociPerSpecies; locus += 1) {
          if (host.genome[offset + locus] === parasite.genome[locus]) matches += 1;
        }
        parasite.score += matches;
        exposures[assignments[hostIndex]] += 1;
        host.matches += matches;
        host.score += this.options.lociPerSpecies - matches;
      }
      population.forEach((parasite, index) => { parasite.score = exposures[index] ? parasite.score / exposures[index] : 0; });
      parasiteFitnessBySpecies.push(mean(population.map((parasite) => parasite.score)) / this.options.lociPerSpecies);
      this.reproduceParasites(species);
    }

    if (this.options.environmentalSD > 0) {
      for (const host of this.hosts) host.score += this.random.normal() * this.options.environmentalSD;
    }

    const sexualHosts = this.hosts.filter((host) => host.genome[0] === 1);
    const asexualHosts = this.hosts.filter((host) => host.genome[0] === 0);
    const normalizedHostFitness = (hosts) => hosts.length
      ? mean(hosts.map((host) => Math.max(0, Math.min(1, host.score / this.resistanceLength))))
      : null;
    return {
      fitnessSexual: normalizedHostFitness(sexualHosts),
      fitnessAsexual: normalizedHostFitness(asexualHosts),
      fitnessParasite: mean(parasiteFitnessBySpecies),
    };
  }

  reproduceParasites(species) {
    const population = this.parasites[species];
    const ranked = population
      .map((parasite) => ({ parasite, tie: this.random.next() }))
      .sort((a, b) => b.parasite.score - a.parasite.score || a.tie - b.tie);
    const survivorCount = population.length - this.parasiteDeaths;
    const survivors = ranked.slice(0, survivorCount).map(({ parasite }) => parasite);
    const next = survivors.map((parasite) => ({ genome: parasite.genome.slice(), score: 0 }));
    while (next.length < population.length) {
      const parent = weightedChoice(survivors, (parasite) => parasite.score, this.random);
      next.push({
        genome: flipMutations(parent.genome, this.options.parasiteMutation, this.random),
        score: 0,
      });
    }
    this.parasites[species] = next;
  }

  selectHosts() {
    const ranked = this.hosts
      .map((host) => ({ host, tie: this.random.next() }))
      .sort((a, b) => b.host.score - a.host.score || a.tie - b.tie);
    this.hosts = ranked.slice(0, this.hosts.length - this.hostDeaths).map(({ host }) => host);
    for (const host of this.hosts) host.age += 1;
  }

  reproduceHosts() {
    let adults = this.hosts.filter((host) => host.age >= this.options.juvenileYears + 1);
    if (!adults.length) adults = this.hosts;
    let sexual = adults.filter((host) => host.genome[0] === 1);
    let asexual = adults.filter((host) => host.genome[0] === 0);

    while (this.hosts.length < this.options.hostPopulation) {
      const sexualUnits = sexual.length >= 2 ? sexual.length / 2 : 0;
      const asexualUnits = asexual.length;
      const useSex = sexualUnits > 0 && (asexualUnits === 0 || this.random.next() < sexualUnits / (sexualUnits + asexualUnits));
      let genome;
      if (useSex) {
        const firstIndex = this.random.int(sexual.length);
        let secondIndex = this.random.int(sexual.length - 1);
        if (secondIndex >= firstIndex) secondIndex += 1;
        genome = crossover(
          sexual[firstIndex].genome,
          sexual[secondIndex].genome,
          this.options.recombination,
          this.random,
        );
      } else {
        const pool = asexual.length ? asexual : adults;
        genome = pool[this.random.int(pool.length)].genome.slice();
      }
      genome = flipMutations(genome, this.options.hostMutation, this.random);
      if (this.year < 0) genome[0] = 0;
      this.hosts.push({ age: 0, genome, score: 0, matches: 0 });
    }
  }

  record(fitness) {
    const sexualCount = this.hosts.filter((host) => host.genome[0] === 1).length;
    const sexShare = sexualCount / this.hosts.length;
    const alleleFrequencies = [];
    for (let locus = 1; locus <= Math.min(3, this.resistanceLength); locus += 1) {
      alleleFrequencies.push(mean(this.hosts.map((host) => host.genome[locus])));
    }
    const record = {
      year: this.year,
      sexShare,
      sexualCount,
      asexualCount: this.hosts.length - sexualCount,
      alleleFrequencies,
      meanMatch: mean(this.hosts.map((host) => host.matches)) / this.resistanceLength,
      ...fitness,
    };
    if (this.year >= 0) this.history.push(record);
    return record;
  }

  step() {
    if (this.year < 0) {
      for (const host of this.hosts) host.genome[0] = 0;
    }
    if (!this.sexIntroduced && this.year === 0) this.introduceSex();
    const fitness = this.infectAndScore();
    this.selectHosts();
    this.reproduceHosts();
    const record = this.record(fitness);
    this.year += 1;
    return record;
  }

  isFinished() {
    return this.year >= this.options.runYears;
  }

  summary() {
    const tail = this.history.slice(-50);
    const final = this.history[this.history.length - 1] || { sexShare: 0, meanMatch: 0 };
    return {
      seed: this.options.seed,
      hostPopulation: this.options.hostPopulation,
      parasitePopulation: this.options.parasitePopulation,
      meanSexLast50: mean(tail.map((row) => row.sexShare)),
      finalSexShare: final.sexShare,
      finalMeanMatch: final.meanMatch,
      hostModes: this.hosts.map((host) => host.genome[0]),
      history: this.history,
    };
  }
}

function simulationToCSV(summary) {
  const header = ["ano", "sexuais", "assexuais", "fracao_sexual", "fitness_sexuais", "fitness_assexuais", "fitness_parasitas", "correspondencia_media", "alelo_1", "alelo_2", "alelo_3"];
  const rows = summary.history.map((row) => [
    row.year,
    row.sexualCount,
    row.asexualCount,
    row.sexShare,
    row.fitnessSexual ?? "",
    row.fitnessAsexual ?? "",
    row.fitnessParasite,
    row.meanMatch,
    row.alleleFrequencies[0] ?? "",
    row.alleleFrequencies[1] ?? "",
    row.alleleFrequencies[2] ?? "",
  ]);
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

if (typeof window !== "undefined") Object.assign(window, { PAPER_DEFAULTS, SeededRandom, HamiltonSimulation, simulationToCSV });
