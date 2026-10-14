// Shapes returned by https://ftc-api.firstinspires.org/v2.0 (only fields we consume).

export type TournamentLevel = "QUALIFICATION" | "SEMIFINAL" | "FINAL" | "PLAYOFF" | "OTHER";

export interface ApiEvent {
  code: string;
  divisionCode: string | null;
  name: string;
  remote: boolean;
  hybrid: boolean;
  fieldCount: number;
  published: boolean;
  type: string;
  typeName: string;
  regionCode: string | null;
  leagueCode: string | null;
  districtCode: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  stateprov: string | null;
  country: string | null;
  website: string | null;
  liveStreamUrl: string | null;
  webcasts: string[] | null;
  timezone: string | null;
  dateStart: string;
  dateEnd: string;
}

export interface ApiTeam {
  teamNumber: number;
  nameFull: string | null;
  nameShort: string | null;
  schoolName: string | null;
  city: string | null;
  stateProv: string | null;
  country: string | null;
  website: string | null;
  rookieYear: number | null;
  robotName: string | null;
  districtCode: string | null;
  homeCMP: string | null;
  homeRegion: string | null;
  displayLocation: string | null;
}

export interface ApiTeamsPage {
  teams: ApiTeam[];
  teamCountTotal: number;
  teamCountPage: number;
  pageCurrent: number;
  pageTotal: number;
}

export interface ApiHybridTeam {
  teamNumber: number | null;
  station: string; // Red1 | Red2 | Blue1 | Blue2
  surrogate: boolean;
  noShow: boolean;
  dq: boolean;
  onField: boolean;
}

export interface ApiHybridMatch {
  description: string;
  tournamentLevel: TournamentLevel;
  series: number;
  matchNumber: number;
  field?: string | null;
  startTime: string | null;
  actualStartTime: string | null;
  postResultTime: string | null;
  scoreRedFinal: number | null;
  scoreRedFoul: number | null;
  scoreRedAuto: number | null;
  scoreBlueFinal: number | null;
  scoreBlueFoul: number | null;
  scoreBlueAuto: number | null;
  redWins: boolean;
  blueWins: boolean;
  teams: ApiHybridTeam[];
}

export interface ApiMatchScores<A> {
  matchLevel: TournamentLevel;
  matchSeries: number;
  matchNumber: number;
  randomization?: number;
  alliances: A[];
}

export interface ApiRanking {
  rank: number;
  teamNumber: number;
  sortOrder1: number;
  sortOrder2: number;
  sortOrder3: number;
  sortOrder4: number;
  sortOrder5: number;
  sortOrder6: number;
  wins: number;
  losses: number;
  ties: number;
  dq: number;
  matchesPlayed: number;
  matchesCounted: number;
}

export interface ApiAlliance {
  number: number;
  name: string | null;
  captain: unknown;
  round1: unknown;
  round2: unknown;
  round3: number | null;
  backup: unknown;
}

export interface ApiAward {
  awardId: number;
  teamId?: number | null;
  eventCode: string;
  name: string;
  series: number;
  teamNumber: number | null;
  person: string | null;
}

export interface ApiLeague {
  region: string;
  code: string;
  name: string;
  parentLeagueCode: string | null;
}
