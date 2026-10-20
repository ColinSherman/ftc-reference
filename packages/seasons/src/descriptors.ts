import { type ApiScore, majors, minors, n, type SeasonDescriptor } from "./types";

const fouls = (lbl = "Fouls"): SeasonDescriptor["breakdown"] => [
  { label: `Minor ${lbl.toLowerCase()}`, value: minors, lower: true },
  { label: `Major ${lbl.toLowerCase()}`, value: majors, lower: true },
];

// ---------------------------------------------------------------- 2019 SKYSTONE
/**
 * The API reports endGamePoints/parkingPoints as 0 for SKYSTONE, so rebuild the endgame from its
 * parts: capstone bonus + foundation moved out of the building site (15) + 5 per parked robot.
 */
const skystoneEndgame = (a: ApiScore) =>
  n(a.capstonePoints) + (a.foundationMoved ? 15 : 0) + (a.robot1Parked ? 5 : 0) + (a.robot2Parked ? 5 : 0);

const skystone: SeasonDescriptor = {
  season: 2019,
  cmpYear: 2020,
  game: "SKYSTONE",
  program: "FIRST RISE",
  kickoff: "2019-09-07",
  hasRemote: false,
  common: (a) => {
    const eg = skystoneEndgame(a);
    const np = n(a.autonomousPoints) + n(a.driverControlledPoints) + eg;
    return {
      auto: n(a.autonomousPoints),
      endgame: eg,
      np,
      total: n(a.totalPoints),
      fouls: minors(a) * 5 + majors(a) * 20,
    };
  },
  components: [
    {
      key: "c1",
      label: "Delivery",
      tip: "Stone delivery points (auto + driver-controlled)",
      value: (a) => n(a.autoDeliveryPoints) + n(a.driverControlledDeliveryPoints),
    },
    {
      key: "c2",
      label: "Placing",
      tip: "Stone placement points (auto + driver-controlled)",
      value: (a) => n(a.autoPlacedPoints) + n(a.driverControlledPlacedPoints),
    },
    {
      key: "c3",
      label: "Skyscraper",
      tip: "Skyscraper bonus points",
      value: (a) => n(a.skyscraperBonusPoints),
    },
    { key: "c4", label: "Capstone", tip: "Capstone points", value: (a) => n(a.capstonePoints) },
  ],
  breakdown: [
    { label: "Auto delivery", value: (a) => n(a.autoDeliveryPoints) },
    { label: "Auto placed", value: (a) => n(a.autoPlacedPoints) },
    { label: "Foundation repositioned", value: (a) => n(a.repositionedPoints) },
    { label: "Navigation", value: (a) => n(a.navigationPoints) },
    { label: "Auto total", value: (a) => n(a.autonomousPoints), sub: true },
    { label: "Stones delivered", value: (a) => n(a.driverControlledDelivered) },
    { label: "Delivery points", value: (a) => n(a.driverControlledDeliveryPoints) },
    { label: "Placed points", value: (a) => n(a.driverControlledPlacedPoints) },
    { label: "Tallest skyscraper", value: (a) => n(a.tallestSkyscraper) },
    { label: "Skyscraper bonus", value: (a) => n(a.skyscraperBonusPoints) },
    { label: "Driver-controlled total", value: (a) => n(a.driverControlledPoints), sub: true },
    { label: "Capstone", value: (a) => n(a.capstonePoints) },
    { label: "Foundation moved out", value: (a) => (a.foundationMoved ? 15 : 0) },
    { label: "Parking", value: (a) => (a.robot1Parked ? 5 : 0) + (a.robot2Parked ? 5 : 0) },
    { label: "Endgame total", value: (a) => skystoneEndgame(a), sub: true },
    ...fouls("Penalties"),
  ],
};

// ---------------------------------------------------------------- 2020 ULTIMATE GOAL
const ultimateGoal: SeasonDescriptor = {
  season: 2020,
  cmpYear: 2021,
  game: "ULTIMATE GOAL",
  program: "FIRST GAME CHANGERS",
  kickoff: "2020-09-12",
  hasRemote: true,
  penaltiesDeducted: true,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.endgamePoints),
    np: n(a.autoPoints) + n(a.dcPoints) + n(a.endgamePoints),
    total: n(a.totalPoints),
    fouls: minors(a) * 10 + majors(a) * 30,
  }),
  components: [
    {
      key: "c1",
      label: "Auto Tower",
      tip: "Auto ring points in the tower goals",
      value: (a) => n(a.autoTowerPoints),
    },
    {
      key: "c2",
      label: "Power Shots",
      tip: "Power shot points (auto + endgame)",
      value: (a) => n(a.autoPowerShotPoints) + n(a.endPowerShotPoints),
    },
    {
      key: "c3",
      label: "Wobble",
      tip: "Wobble goal points (auto delivery + endgame rings and position)",
      value: (a) => n(a.autoWobblePoints) + n(a.wobbleEndPoints) + n(a.wobbleRingPoints),
    },
    { key: "c4", label: "DC Rings", tip: "Driver-controlled tower ring points", value: (a) => n(a.dcPoints) },
  ],
  breakdown: [
    { label: "Navigation", value: (a) => n(a.navigationPoints) },
    { label: "Auto tower", value: (a) => n(a.autoTowerPoints) },
    { label: "Auto power shots", value: (a) => n(a.autoPowerShotPoints) },
    { label: "Auto wobble", value: (a) => n(a.autoWobblePoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    {
      label: "Rings low / mid / high",
      value: (a) => `${n(a.dcTowerLow)} / ${n(a.dcTowerMid)} / ${n(a.dcTowerHigh)}`,
    },
    { label: "Driver-controlled total", value: (a) => n(a.dcPoints), sub: true },
    { label: "Wobble rings", value: (a) => n(a.wobbleRingPoints) },
    { label: "Wobble position", value: (a) => n(a.wobbleEndPoints) },
    { label: "Endgame power shots", value: (a) => n(a.endPowerShotPoints) },
    { label: "Endgame total", value: (a) => n(a.endgamePoints), sub: true },
    ...fouls("Penalties"),
  ],
};

// ---------------------------------------------------------------- 2021 FREIGHT FRENZY
const freightFrenzy: SeasonDescriptor = {
  season: 2021,
  cmpYear: 2022,
  game: "FREIGHT FRENZY",
  program: "FIRST FORWARD",
  kickoff: "2021-09-18",
  hasRemote: true,
  penaltiesDeducted: true,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.endgamePoints),
    np: n(a.autoPoints) + n(a.driverControlledPoints) + n(a.endgamePoints),
    total: n(a.totalPoints),
    fouls: minors(a) * 10 + majors(a) * 30,
  }),
  components: [
    {
      key: "c1",
      label: "Alliance Hub",
      tip: "Driver-controlled alliance shipping hub points",
      value: (a) => n(a.driverControlledAllianceHubPoints),
    },
    {
      key: "c2",
      label: "Shared Hub",
      tip: "Driver-controlled shared shipping hub points",
      value: (a) => n(a.driverControlledSharedHubPoints),
    },
    {
      key: "c3",
      label: "Ducks",
      tip: "Carousel points (auto) + ducks/shipping elements delivered in endgame",
      value: (a) => n(a.carouselPoints) + n(a.endgameDeliveryPoints),
    },
    {
      key: "c4",
      label: "Capping",
      tip: "Team shipping element capping points",
      value: (a) => n(a.cappingPoints),
    },
  ],
  breakdown: [
    { label: "Carousel", value: (a) => n(a.carouselPoints) },
    { label: "Auto navigation", value: (a) => n(a.autoNavigationPoints) },
    { label: "Auto freight", value: (a) => n(a.autoFreightPoints) },
    { label: "Auto bonus", value: (a) => n(a.autoBonusPoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    { label: "Alliance hub", value: (a) => n(a.driverControlledAllianceHubPoints) },
    { label: "Shared hub", value: (a) => n(a.driverControlledSharedHubPoints) },
    { label: "Storage unit", value: (a) => n(a.driverControlledStoragePoints) },
    { label: "Driver-controlled total", value: (a) => n(a.driverControlledPoints), sub: true },
    { label: "Ducks delivered", value: (a) => n(a.endgameDeliveryPoints) },
    { label: "Alliance hub balanced", value: (a) => n(a.allianceBalancedPoints) },
    { label: "Shared hub tipped", value: (a) => n(a.sharedUnbalancedPoints) },
    { label: "Parking", value: (a) => n(a.endgameParkingPoints) },
    { label: "Capping", value: (a) => n(a.cappingPoints) },
    { label: "Endgame total", value: (a) => n(a.endgamePoints), sub: true },
    ...fouls("Penalties"),
  ],
};

// ---------------------------------------------------------------- 2022 POWERPLAY
const powerPlay: SeasonDescriptor = {
  season: 2022,
  cmpYear: 2023,
  game: "POWERPLAY",
  program: "FIRST ENERGIZE",
  kickoff: "2022-09-10",
  hasRemote: false,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.endgamePoints),
    np: n(a.prePenaltyTotal) || n(a.autoPoints) + n(a.dcPoints) + n(a.endgamePoints),
    total: n(a.totalPoints),
    fouls: n(a.penaltyPointsCommitted),
  }),
  components: [
    {
      key: "c1",
      label: "Auto Cones",
      tip: "Auto cone points (junctions + terminal)",
      value: (a) => n(a.autoJunctionConePoints) + n(a.autoTerminalConePoints),
    },
    {
      key: "c2",
      label: "DC Cones",
      tip: "Driver-controlled cone points (junctions + terminal)",
      value: (a) => n(a.dcJunctionConePoints) + n(a.dcTerminalConePoints),
    },
    { key: "c3", label: "Ownership", tip: "Junction ownership points", value: (a) => n(a.ownershipPoints) },
    { key: "c4", label: "Circuit", tip: "Circuit completion points", value: (a) => n(a.circuitPoints) },
  ],
  breakdown: [
    { label: "Auto navigation", value: (a) => n(a.autoNavigationPoints) },
    { label: "Signal bonus", value: (a) => n(a.signalBonusPoints) },
    { label: "Auto junction cones", value: (a) => n(a.autoJunctionConePoints) },
    { label: "Auto terminal cones", value: (a) => n(a.autoTerminalConePoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    { label: "Junction cones", value: (a) => n(a.dcJunctionConePoints) },
    { label: "Terminal cones", value: (a) => n(a.dcTerminalConePoints) },
    { label: "Driver-controlled total", value: (a) => n(a.dcPoints), sub: true },
    { label: "Junctions owned", value: (a) => n(a.ownedJunctions) },
    { label: "Ownership", value: (a) => n(a.ownershipPoints) },
    { label: "Beacons", value: (a) => n(a.beacons) },
    { label: "Circuit", value: (a) => n(a.circuitPoints) },
    { label: "Endgame navigation", value: (a) => n(a.egNavigationPoints) },
    { label: "Endgame total", value: (a) => n(a.endgamePoints), sub: true },
    ...fouls("Penalties"),
  ],
};

// ---------------------------------------------------------------- 2023 CENTERSTAGE
const centerStage: SeasonDescriptor = {
  season: 2023,
  cmpYear: 2024,
  game: "CENTERSTAGE",
  program: "FIRST IN SHOW",
  kickoff: "2023-09-09",
  hasRemote: false,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.endgamePoints),
    np: n(a.prePenaltyTotal) || n(a.autoPoints) + n(a.dcPoints) + n(a.endgamePoints),
    total: n(a.totalPoints),
    fouls: n(a.penaltyPointsCommitted),
  }),
  components: [
    {
      key: "c1",
      label: "Randomize",
      tip: "Auto randomization points (purple pixel on spike mark, yellow pixel on backdrop)",
      value: (a) => n(a.autoRandomizationPoints),
    },
    {
      key: "c2",
      label: "Backdrop",
      tip: "Backdrop pixel points (auto + driver-controlled)",
      value: (a) => n(a.autoBackdropPoints) + n(a.dcBackdropPoints),
    },
    {
      key: "c3",
      label: "Mosaic+Set",
      tip: "Mosaic + set line bonus points",
      value: (a) => n(a.mosaicPoints) + n(a.setBonusPoints),
    },
    { key: "c4", label: "Drone", tip: "Drone launch points", value: (a) => n(a.egDronePoints) },
  ],
  breakdown: [
    { label: "Auto navigation", value: (a) => n(a.autoNavigationPoints) },
    { label: "Randomization", value: (a) => n(a.autoRandomizationPoints) },
    { label: "Auto backstage", value: (a) => n(a.autoBackstagePoints) },
    { label: "Auto backdrop", value: (a) => n(a.autoBackdropPoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    { label: "Backdrop pixels", value: (a) => n(a.dcBackdropPoints) },
    { label: "Backstage pixels", value: (a) => n(a.dcBackstagePoints) },
    { label: "Mosaics", value: (a) => n(a.mosaics) },
    { label: "Mosaic points", value: (a) => n(a.mosaicPoints) },
    { label: "Set lines reached", value: (a) => n(a.maxSetLine) },
    { label: "Set bonus", value: (a) => n(a.setBonusPoints) },
    { label: "Driver-controlled total", value: (a) => n(a.dcPoints), sub: true },
    { label: "Park / hang", value: (a) => n(a.egLocationPoints) },
    { label: "Drone", value: (a) => n(a.egDronePoints) },
    { label: "Endgame total", value: (a) => n(a.endgamePoints), sub: true },
    ...fouls("Penalties"),
  ],
};

// ---------------------------------------------------------------- 2024 INTO THE DEEP
const intoTheDeep: SeasonDescriptor = {
  season: 2024,
  cmpYear: 2025,
  game: "INTO THE DEEP",
  program: "FIRST DIVE",
  kickoff: "2024-09-07",
  hasRemote: false,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.endGamePoints) || n(a.teleopParkPoints) + n(a.teleopAscentPoints),
    np: n(a.preFoulTotal) || n(a.autoPoints) + n(a.teleopPoints),
    total: n(a.totalPoints),
    fouls: n(a.foulPointsCommitted),
  }),
  components: [
    {
      key: "c1",
      label: "Samples",
      tip: "Sample points (auto + teleop)",
      value: (a) => n(a.autoSamplePoints) + n(a.teleopSamplePoints),
    },
    {
      key: "c2",
      label: "Specimens",
      tip: "Specimen points (auto + teleop)",
      value: (a) => n(a.autoSpecimenPoints) + n(a.teleopSpecimenPoints),
    },
    { key: "c3", label: "Ascent", tip: "Endgame ascent points", value: (a) => n(a.teleopAscentPoints) },
    {
      key: "c4",
      label: "High Basket",
      tip: "Samples scored in the high basket per match (auto + teleop)",
      value: (a) => n(a.autoSampleHigh) + n(a.teleopSampleHigh),
      count: true,
    },
  ],
  breakdown: [
    {
      label: "Auto samples net / low / high",
      value: (a) => `${n(a.autoSampleNet)} / ${n(a.autoSampleLow)} / ${n(a.autoSampleHigh)}`,
    },
    { label: "Auto sample points", value: (a) => n(a.autoSamplePoints) },
    {
      label: "Auto specimens low / high",
      value: (a) => `${n(a.autoSpecimenLow)} / ${n(a.autoSpecimenHigh)}`,
    },
    { label: "Auto specimen points", value: (a) => n(a.autoSpecimenPoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    {
      label: "Samples net / low / high",
      value: (a) => `${n(a.teleopSampleNet)} / ${n(a.teleopSampleLow)} / ${n(a.teleopSampleHigh)}`,
    },
    { label: "Sample points", value: (a) => n(a.teleopSamplePoints) },
    { label: "Specimens low / high", value: (a) => `${n(a.teleopSpecimenLow)} / ${n(a.teleopSpecimenHigh)}` },
    { label: "Specimen points", value: (a) => n(a.teleopSpecimenPoints) },
    { label: "Park", value: (a) => n(a.teleopParkPoints) },
    { label: "Ascent", value: (a) => n(a.teleopAscentPoints) },
    { label: "TeleOp total", value: (a) => n(a.teleopPoints), sub: true },
    ...fouls(),
    { label: "Foul pts given away", value: (a) => n(a.foulPointsCommitted), lower: true },
  ],
};

// ---------------------------------------------------------------- 2025 DECODE
const decode: SeasonDescriptor = {
  season: 2025,
  cmpYear: 2026,
  game: "DECODE",
  program: "FIRST AGE",
  kickoff: "2025-09-06",
  hasRemote: false,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.teleopBasePoints),
    np: n(a.preFoulTotal) || n(a.autoPoints) + n(a.teleopPoints),
    total: n(a.totalPoints),
    fouls: n(a.foulPointsCommitted),
  }),
  components: [
    {
      key: "c1",
      label: "Artifacts",
      tip: "Artifact points (auto + teleop)",
      value: (a) => n(a.autoArtifactPoints) + n(a.teleopArtifactPoints),
    },
    {
      key: "c2",
      label: "Pattern",
      tip: "Motif pattern points (auto + teleop)",
      value: (a) => n(a.autoPatternPoints) + n(a.teleopPatternPoints),
    },
    { key: "c3", label: "Depot", tip: "Depot artifact points", value: (a) => n(a.teleopDepotPoints) },
    {
      key: "c4",
      label: "Classified",
      tip: "Artifacts classified per match (auto + teleop)",
      value: (a) => n(a.autoClassifiedArtifacts) + n(a.teleopClassifiedArtifacts),
      count: true,
    },
  ],
  breakdown: [
    { label: "Leave", value: (a) => n(a.autoLeavePoints) },
    {
      label: "Auto classified / overflow",
      value: (a) => `${n(a.autoClassifiedArtifacts)} / ${n(a.autoOverflowArtifacts)}`,
    },
    { label: "Auto artifact points", value: (a) => n(a.autoArtifactPoints) },
    { label: "Auto pattern points", value: (a) => n(a.autoPatternPoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    {
      label: "Classified / overflow / depot",
      value: (a) =>
        `${n(a.teleopClassifiedArtifacts)} / ${n(a.teleopOverflowArtifacts)} / ${n(a.teleopDepotArtifacts)}`,
    },
    { label: "Artifact points", value: (a) => n(a.teleopArtifactPoints) },
    { label: "Depot points", value: (a) => n(a.teleopDepotPoints) },
    { label: "Pattern points", value: (a) => n(a.teleopPatternPoints) },
    { label: "Base", value: (a) => n(a.teleopBasePoints) },
    { label: "TeleOp total", value: (a) => n(a.teleopPoints), sub: true },
    ...fouls(),
    { label: "Foul pts given away", value: (a) => n(a.foulPointsCommitted), lower: true },
  ],
  rps: [
    { label: "MOVEMENT RP", value: (a: ApiScore) => !!a.movementRP },
    { label: "GOAL RP", value: (a: ApiScore) => !!a.goalRP },
    { label: "PATTERN RP", value: (a: ApiScore) => !!a.patternRP },
  ],
};

// ---------------------------------------------------------------- 2026 BIOBUZZ
/** TeleOp HIVE points are 20 per tip plus this much per POLLEN/NECTAR left in an up-facing CELL. */
const CELL_PIECE_PTS = 2;

/**
 * Cap the pieces counted in CELLs at `max` and take the excess off every total that includes them.
 * The API's original count is kept as `reportedHivePollenNectar`.
 */
const capCellPieces =
  (max: number) =>
  (a: ApiScore): ApiScore | null => {
    const reported = n(a.teleopHivePollenNectar);
    if (reported <= max) return null;
    const cut = (reported - max) * CELL_PIECE_PTS;
    const less = (v: unknown) => (typeof v === "number" ? v - cut : v);
    return {
      ...a,
      teleopHivePollenNectar: max,
      teleopHivePoints: less(a.teleopHivePoints),
      teleopPoints: less(a.teleopPoints),
      preFoulTotal: less(a.preFoulTotal),
      totalPoints: less(a.totalPoints),
      reportedHivePollenNectar: reported,
    };
  };

const biobuzz: SeasonDescriptor = {
  season: 2026,
  cmpYear: 2027,
  game: "BIOBUZZ",
  program: "FIRST CANOPY",
  kickoff: "2026-09-12",
  hasRemote: false,
  common: (a) => ({
    auto: n(a.autoPoints),
    endgame: n(a.teleopParkPoints),
    np: n(a.preFoulTotal) || n(a.autoPoints) + n(a.teleopPoints),
    total: n(a.totalPoints),
    fouls: n(a.foulPointsCommitted),
  }),
  components: [
    {
      key: "c1",
      label: "Tips",
      tip: "HIVE tips per match (auto + teleop)",
      value: (a) => n(a.autoHiveTips) + n(a.teleopHiveTips),
      count: true,
    },
    {
      key: "c2",
      label: "Hive",
      tip: "TeleOp HIVE points (tips + pieces in up-facing CELLs)",
      value: (a) => n(a.teleopHivePoints),
    },
    { key: "c3", label: "Flower", tip: "FLOWER points", value: (a) => n(a.teleopFlowerPoints) },
    { key: "c4", label: "Garden", tip: "GARDEN points", value: (a) => n(a.teleopGardenPoints) },
  ],
  breakdown: [
    { label: "LEAVE", value: (a) => n(a.autoLeavePoints) },
    { label: "Auto PARK", value: (a) => n(a.autoParkPoints) },
    { label: "Auto HIVE tips", value: (a) => n(a.autoHiveTips) },
    { label: "Auto HIVE points", value: (a) => n(a.autoHivePoints) },
    { label: "Auto total", value: (a) => n(a.autoPoints), sub: true },
    { label: "TeleOp HIVE tips", value: (a) => n(a.teleopHiveTips) },
    {
      label: "Pieces in CELLs",
      value: (a) =>
        a.reportedHivePollenNectar == null
          ? n(a.teleopHivePollenNectar)
          : `${n(a.teleopHivePollenNectar)}* (${a.reportedHivePollenNectar} entered)`,
    },
    { label: "HIVE points", value: (a) => n(a.teleopHivePoints) },
    { label: "FLOWER points", value: (a) => n(a.teleopFlowerPoints) },
    { label: "GARDEN pieces", value: (a) => n(a.teleopGardenPollenNectar) },
    { label: "GARDEN points", value: (a) => n(a.teleopGardenPoints) },
    { label: "PARK", value: (a) => n(a.teleopParkPoints) },
    { label: "TeleOp total", value: (a) => n(a.teleopPoints), sub: true },
    ...fouls(),
    { label: "Foul pts given away", value: (a) => n(a.foulPointsCommitted), lower: true },
  ],
  rps: [
    { label: "SWARM RP", value: (a: ApiScore) => !!a.swarmRP },
    { label: "POLLINATOR 1 RP", value: (a: ApiScore) => !!a.pollinator1RP },
    { label: "POLLINATOR 2 RP", value: (a: ApiScore) => !!a.pollinator2RP },
  ],
  corrections: {
    // Scorekeepers counted every piece from every tip in the final CELL count, not just the pieces
    // still in CELLs at the end. 8+ is capped at 7, which may still overstate some alliances.
    KZASN1: {
      note: "Scorekeepers counted every piece from every tip as still in a CELL. Counts of 8 or more are capped at 7 (which may still be high) and the points rescored.",
      affects: ["np", "total", "teleop", "c2"],
      apply: capCellPieces(7),
    },
  },
};

export const SEASONS: Record<number, SeasonDescriptor> = Object.fromEntries(
  [skystone, ultimateGoal, freightFrenzy, powerPlay, centerStage, intoTheDeep, decode, biobuzz].map((d) => [
    d.season,
    d,
  ]),
);
