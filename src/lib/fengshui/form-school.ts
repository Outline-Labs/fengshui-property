import { getNearestPOI, getPOIsNear } from "../pois";
import type { Coords, FengshuiFactor, FormSchoolAnalysis } from "../types";

const BASE_SCORE = 5;

export function analyzeFormSchool(property: Coords): FormSchoolAnalysis {
  const factors: FengshuiFactor[] = [];

  const cemetery = getNearestPOI(property, ["cemetery"]);
  if (cemetery && cemetery.distanceMeters <= 500) {
    if (cemetery.distanceMeters <= 100) {
      factors.push({
        type: "negative",
        severity: 3,
        category: "cemetery",
        title: `Cemetery directly adjacent (${Math.round(cemetery.distanceMeters)}m)`,
        description: `${cemetery.name} is very close, intensifying yin (阴) qi. Traditionally considered highly inauspicious for residential dwellings.`,
        distanceMeters: cemetery.distanceMeters,
        reference: cemetery.id,
      });
    } else if (cemetery.distanceMeters <= 300) {
      factors.push({
        type: "negative",
        severity: 2,
        category: "cemetery",
        title: `Cemetery within 300m`,
        description: `${cemetery.name} at ${Math.round(cemetery.distanceMeters)}m carries yin energy. Natural buffers (mature trees, taller buildings between) can mitigate.`,
        distanceMeters: cemetery.distanceMeters,
        reference: cemetery.id,
      });
    } else {
      factors.push({
        type: "negative",
        severity: 1,
        category: "cemetery",
        title: `Cemetery within 500m`,
        description: `${cemetery.name} at ${Math.round(cemetery.distanceMeters)}m. Distance significantly reduces the effect.`,
        distanceMeters: cemetery.distanceMeters,
        reference: cemetery.id,
      });
    }
  }

  const hospital = getNearestPOI(property, ["hospital"]);
  if (hospital && hospital.distanceMeters <= 300) {
    if (hospital.distanceMeters <= 100) {
      factors.push({
        type: "negative",
        severity: 2,
        category: "hospital",
        title: `Hospital within 100m`,
        description: `${hospital.name} at ${Math.round(hospital.distanceMeters)}m. Sick qi (病气) is said to accumulate near major medical facilities.`,
        distanceMeters: hospital.distanceMeters,
        reference: hospital.id,
      });
    } else {
      factors.push({
        type: "negative",
        severity: 1,
        category: "hospital",
        title: `Hospital nearby (${Math.round(hospital.distanceMeters)}m)`,
        description: `${hospital.name}. Mild sick-qi influence, usually mitigated by distance and modern building design.`,
        distanceMeters: hospital.distanceMeters,
        reference: hospital.id,
      });
    }
  }

  const power = getNearestPOI(property, ["power_station"]);
  if (power && power.distanceMeters <= 200) {
    factors.push({
      type: "negative",
      severity: power.distanceMeters <= 75 ? 2 : 1,
      category: "power_station",
      title: `Power substation ${Math.round(power.distanceMeters)}m away`,
      description: `Electromagnetic sha (电磁煞) from high-voltage equipment disrupts the natural qi field. Trees or screens between can help.`,
      distanceMeters: power.distanceMeters,
      reference: power.id,
    });
  }

  const industrial = getNearestPOI(property, ["industrial"]);
  if (industrial && industrial.distanceMeters <= 200) {
    factors.push({
      type: "negative",
      severity: industrial.distanceMeters <= 100 ? 2 : 1,
      category: "industrial",
      title: `Industrial zone within ${Math.round(industrial.distanceMeters)}m`,
      description: `${industrial.name && industrial.name !== "(unnamed)" ? industrial.name : "Industrial area"}. Manufacturing/logistics activity generates chaotic qi.`,
      distanceMeters: industrial.distanceMeters,
      reference: industrial.id,
    });
  }

  const parks = getPOIsNear(property, 500, ["park"]);
  if (parks.length > 0 && (parks.length >= 2 || parks[0].distanceMeters <= 200)) {
    factors.push({
      type: "positive",
      // Abundant greenery (4+) is strong yang qi; 3 is good; a single close /
      // a couple within range is a modest plus.
      severity: parks.length >= 4 ? 3 : parks.length >= 3 ? 2 : 1,
      category: "park",
      title: `${parks.length} green space${parks.length > 1 ? "s" : ""} within 500m`,
      description: `Greenery generates yang qi and oxygenates the local environment. Nearest: ${parks[0].name} at ${Math.round(parks[0].distanceMeters)}m.`,
      distanceMeters: parks[0].distanceMeters,
    });
  }

  // Water governs wealth in classical form school — "山管人丁，水管财" — and qi
  // gathers and settles at the water's edge. Proximity to open water
  // (reservoir, river, canal, sea) is the strongest environmental positive,
  // so it carries the full severity range (waterfront = 3).
  const water = getNearestPOI(property, ["water"]);
  if (water && water.distanceMeters <= 500) {
    const severity = water.distanceMeters <= 100 ? 3 : water.distanceMeters <= 300 ? 2 : 1;
    const named = water.name && water.name !== "(unnamed)" ? water.name : "Open water";
    factors.push({
      type: "positive",
      severity,
      category: "water",
      title:
        severity === 3
          ? `Water frontage (${Math.round(water.distanceMeters)}m)`
          : `Water within ${water.distanceMeters <= 300 ? "300m" : "500m"}`,
      description: `${named} at ${Math.round(water.distanceMeters)}m. Water governs wealth (水主财); qi gathers at its edge — a favourable, prosperous influence.`,
      distanceMeters: water.distanceMeters,
      reference: water.id,
    });
  }

  const mrt = getNearestPOI(property, ["mrt_station"]);
  if (mrt) {
    if (mrt.distanceMeters <= 50) {
      factors.push({
        type: "negative",
        severity: 2,
        category: "mrt_station",
        title: `MRT station extremely close (${Math.round(mrt.distanceMeters)}m)`,
        description: `${mrt.name}. Vibration sha (动煞) from trains and crowd movement disrupts settled qi.`,
        distanceMeters: mrt.distanceMeters,
        reference: mrt.id,
      });
    } else if (mrt.distanceMeters <= 100) {
      factors.push({
        type: "negative",
        severity: 1,
        category: "mrt_station",
        title: `MRT station ${Math.round(mrt.distanceMeters)}m away`,
        description: `${mrt.name}. Convenient but very close — some vibration sha. Higher floors mitigate the effect.`,
        distanceMeters: mrt.distanceMeters,
        reference: mrt.id,
      });
    } else if (mrt.distanceMeters <= 600) {
      factors.push({
        type: "positive",
        severity: 1,
        category: "mrt_station",
        title: `MRT within walking distance (${Math.round(mrt.distanceMeters)}m)`,
        description: `${mrt.name}. Convenient access without proximity vibration impact — a balanced position.`,
        distanceMeters: mrt.distanceMeters,
        reference: mrt.id,
      });
    }
  }

  const school = getNearestPOI(property, ["school"]);
  if (school && school.distanceMeters <= 500) {
    factors.push({
      type: "positive",
      severity: 1,
      category: "school",
      title: `School within 500m`,
      description: `${school.name} at ${Math.round(school.distanceMeters)}m brings vibrant yang qi from children — favourable for family-oriented residences.`,
      distanceMeters: school.distanceMeters,
      reference: school.id,
    });
  }

  let score = BASE_SCORE;
  for (const f of factors) {
    const weight = f.severity * 0.6;
    score += f.type === "positive" ? weight : -weight;
  }
  score = Math.max(0, Math.min(10, score));
  score = Math.round(score * 10) / 10;

  const landmark = getNearestPOI(property, [
    "mrt_station",
    "park",
    "school",
    "religious",
    "hospital",
  ]);

  return {
    score,
    factors,
    summary: {
      positives: factors.filter((f) => f.type === "positive").length,
      negatives: factors.filter((f) => f.type === "negative").length,
    },
    nearestLandmark:
      landmark && landmark.name !== "(unnamed)"
        ? {
            name: landmark.name,
            category: landmark.category,
            distanceMeters: landmark.distanceMeters,
          }
        : undefined,
  };
}
