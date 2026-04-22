// Declarative schema for the entire 18-section walkthrough.
// Each question has a stable id used as the key in WizardAnswers.
// The schema drives rendering (dynamic question route), validation,
// progress, photo naming, skip logic, and the review screen.

import type { PreWalkConfig } from "@/lib/walkthrough";

export type FieldKind =
  | "text" // single-line text
  | "longtext" // notes-style text area (no rating/photos)
  | "number" // numeric input
  | "yesno" // tap-select Yes/No
  | "choice" // single-select from options
  | "multichoice" // multi-select chips
  | "rating" // 1-2-3 rating buttons
  | "photo" // photo capture
  | "video"; // video upload (uses photo storage with .mp4 name)

export interface FollowUp {
  // Show this follow-up only when parent answer matches predicate.
  when: (parent: AnswerValue | undefined) => boolean;
  field: FieldKind;
  required?: boolean;
  label: string; // shown under parent question
  options?: string[]; // for choice / multichoice
  photoName?: string; // for photo follow-ups
  helper?: string;
  minPhotos?: number;
  maxPhotos?: number;
}

export interface QuestionDef {
  id: string;
  sectionIndex: number; // 1-18
  sectionName: string;
  label: string;
  helper?: string;
  field: FieldKind;
  required?: boolean;
  options?: string[]; // for choice / multichoice
  photoName?: string; // base filename, e.g. "EXTERIOR_FRONT" — extension auto-added
  minPhotos?: number; // photo only
  maxPhotos?: number; // photo only
  critical?: boolean; // ⚠️ red border + icon
  notes?: "optional" | "required-if-yes" | "required-if-rating-3"; // notes field behaviour
  notesPlaceholder?: string;
  // Optional inline rating that follows main answer (used by Section 2 siding,
  // foundation, landscape combos: choice + rating in one step).
  withRating?: boolean;
  // Whether a photo is also required alongside the main field (e.g. stove
  // requires photo + rating).
  withPhoto?: { name: string; min?: number };
  // Conditional follow-ups (e.g. Yes -> require notes/photo).
  followUp?: FollowUp;
  // Hide question when this returns false. Evaluated against config + answers.
  visible?: (ctx: SkipContext) => boolean;
}

export interface SectionDef {
  index: number;
  name: string;
  // Returns the ordered list of question definitions for this section
  // (with bedroom/bathroom loops and skip logic resolved).
  resolve: (ctx: SkipContext) => QuestionDef[];
}

export type AnswerValue = unknown;

export interface SkipContext {
  config: PreWalkConfig;
  answers: Record<string, { text?: string; rating?: 1 | 2 | 3; notes?: string; photos?: string[]; choice?: string; choices?: string[]; bool?: boolean; number?: number }>;
}

// ---------- helpers ----------

function parseCount(v: string | undefined): number {
  if (!v) return 0;
  const m = v.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function bathCount(c: PreWalkConfig): number {
  // "1.5", "2.5" etc — round up so half-baths still get a loop.
  if (!c.bathrooms) return 0;
  const n = parseFloat(c.bathrooms);
  return Number.isFinite(n) ? Math.ceil(n) : 0;
}

function bedCount(c: PreWalkConfig): number {
  return parseCount(c.bedrooms);
}

// ---------- section definitions ----------

const S1: SectionDef = {
  index: 1,
  name: "Arrival & Access",
  resolve: () => [
    {
      id: "s1_lockbox_code",
      sectionIndex: 1,
      sectionName: "Arrival & Access",
      label: "Lockbox code",
      helper: "Enter the lockbox combination",
      field: "text",
      required: true,
    },
    {
      id: "s1_lockbox_photo",
      sectionIndex: 1,
      sectionName: "Arrival & Access",
      label: "Lockbox location photo",
      helper: "Photograph the lockbox in context — show where it is attached so the next person can find it",
      field: "photo",
      required: true,
      minPhotos: 1,
      photoName: "LOCKBOX_LOCATION",
    },
    {
      id: "s1_key_works",
      sectionIndex: 1,
      sectionName: "Arrival & Access",
      label: "Key works in lock",
      field: "yesno",
      required: true,
    },
  ],
};

const S2: SectionDef = {
  index: 2,
  name: "Exterior Front",
  resolve: () => [
    photoQ("s2_front_straight", 2, "Exterior Front", "Straight-on front photo", "EXTERIOR_FRONT"),
    photoQ("s2_front_left", 2, "Exterior Front", "Front left angle photo", "EXTERIOR_FRONT_LEFT"),
    photoQ("s2_front_right", 2, "Exterior Front", "Front right angle photo", "EXTERIOR_FRONT_RIGHT"),
    photoQ("s2_roofline", 2, "Exterior Front", "Roofline and fascia close-up", "EXTERIOR_ROOFLINE"),
    photoQ("s2_frontdoor", 2, "Exterior Front", "Front door close-up", "EXTERIOR_FRONTDOOR"),
    photoQ("s2_driveway_photo", 2, "Exterior Front", "Driveway full view", "EXTERIOR_DRIVEWAY"),
    {
      id: "s2_exterior_paint",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Exterior paint condition",
      helper: "Note any water damage, cracking, or peeling",
      field: "rating",
      required: true,
      notes: "optional",
    },
    {
      id: "s2_siding_type",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Siding type",
      field: "choice",
      options: ["Stucco", "Wood", "Combo"],
      required: true,
      withRating: true,
    },
    {
      id: "s2_foundation_type",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Foundation type",
      field: "choice",
      options: ["Slab", "Raised"],
      required: true,
      withRating: true,
    },
    {
      id: "s2_driveway_condition",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Driveway condition",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Describe cracks and location",
    },
    {
      id: "s2_landscape",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Landscape condition",
      field: "choice",
      options: ["Overgrown", "Manicured"],
      required: true,
      withRating: true,
    },
    {
      id: "s2_mailbox",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Mailbox location",
      field: "choice",
      options: ["Cluster community", "Front door", "Yard"],
      required: true,
    },
    {
      id: "s2_front_irrigation",
      sectionIndex: 2,
      sectionName: "Exterior Front",
      label: "Front-yard irrigation present",
      field: "yesno",
      required: true,
    },
  ],
};

const S3: SectionDef = {
  index: 3,
  name: "Exterior Sides & Back",
  resolve: () => [
    photoQ("s3_left", 3, "Exterior Sides & Back", "Left side of house photo", "EXTERIOR_LEFT"),
    photoQ("s3_right", 3, "Exterior Sides & Back", "Right side of house photo", "EXTERIOR_RIGHT"),
    photoQ("s3_back", 3, "Exterior Sides & Back", "Back of house straight-on photo", "EXTERIOR_BACK"),
    {
      ...photoQ("s3_yard_outview", 3, "Exterior Sides & Back", "Backyard looking away from house", "BACKYARD_OUTVIEW"),
      helper: "Stand at the house, photograph the yard looking outward",
    },
    {
      ...photoQ("s3_yard_houseview", 3, "Exterior Sides & Back", "Backyard looking at house", "BACKYARD_HOUSEVIEW"),
      helper: "Stand at the back of the yard, photograph back toward the house",
    },
    {
      id: "s3_back_irrigation",
      sectionIndex: 3,
      sectionName: "Exterior Sides & Back",
      label: "Back-yard irrigation present",
      field: "yesno",
      required: true,
    },
    {
      id: "s3_fence",
      sectionIndex: 3,
      sectionName: "Exterior Sides & Back",
      label: "Fence condition",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Note material and any damage",
    },
    {
      id: "s3_outbuildings",
      sectionIndex: 3,
      sectionName: "Exterior Sides & Back",
      label: "Outbuildings or sheds present",
      field: "yesno",
      required: true,
      followUp: {
        when: (v) => v === true,
        field: "photo",
        required: true,
        label: "Outbuilding photo",
        photoName: "OUTBUILDING",
      },
    },
  ],
};

const S4: SectionDef = {
  index: 4,
  name: "Garage",
  resolve: (ctx) => {
    if (!ctx.config.garage || ctx.config.garage === "None") return [];
    return [
      photoQ("s4_exterior", 4, "Garage", "Garage exterior photo", "GARAGE_EXTERIOR"),
      photoQ("s4_interior", 4, "Garage", "Garage interior wide photo", "GARAGE_INTERIOR"),
      photoQ("s4_roofline", 4, "Garage", "Garage roof and fascia photo", "GARAGE_ROOFLINE"),
      {
        id: "s4_attached",
        sectionIndex: 4,
        sectionName: "Garage",
        label: "Attached or detached",
        field: "choice",
        options: ["Attached", "Detached"],
        required: true,
      },
      {
        id: "s4_door_works",
        sectionIndex: 4,
        sectionName: "Garage",
        label: "Garage door opens and closes properly",
        field: "yesno",
        required: true,
      },
      {
        id: "s4_remotes_count",
        sectionIndex: 4,
        sectionName: "Garage",
        label: "Number of remotes",
        field: "number",
        required: true,
      },
      {
        id: "s4_remotes_location",
        sectionIndex: 4,
        sectionName: "Garage",
        label: "Remote location",
        helper: "Where are the remotes stored?",
        field: "text",
        required: true,
      },
    ];
  },
};

const S5: SectionDef = {
  index: 5,
  name: "Roof",
  resolve: () => [
    {
      ...photoQ("s5_overall", 5, "Roof", "Overall roof photo", "ROOF_OVERALL"),
      helper: "From ground level or drone if available",
    },
    photoQ("s5_closeup", 5, "Roof", "Roof material close-up photo", "ROOF_CLOSEUP"),
    {
      id: "s5_type",
      sectionIndex: 5,
      sectionName: "Roof",
      label: "Roof type",
      field: "choice",
      options: ["Composition", "Tile", "Rock", "Flat"],
      required: true,
    },
    {
      id: "s5_condition",
      sectionIndex: 5,
      sectionName: "Roof",
      label: "Roof overall condition",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Describe damage or wear",
    },
  ],
};

const S6: SectionDef = {
  index: 6,
  name: "Pool & Spa",
  resolve: (ctx) => {
    const hasPool = ctx.config.pool === "Yes";
    const hasSpa = ctx.config.spa === "Yes";
    if (!hasPool && !hasSpa) return [];
    const out: QuestionDef[] = [];
    if (hasPool) {
      out.push(
        photoQ("s6_pool_1", 6, "Pool & Spa", "Pool photo — angle 1", "POOL_1"),
        photoQ("s6_pool_2", 6, "Pool & Spa", "Pool photo — angle 2", "POOL_2"),
        photoQ("s6_pool_equipment", 6, "Pool & Spa", "Pool heater and pump equipment photo", "POOL_EQUIPMENT"),
        {
          id: "s6_pool_location",
          sectionIndex: 6,
          sectionName: "Pool & Spa",
          label: "Pool location",
          field: "choice",
          options: ["Private backyard", "Community HOA"],
          required: true,
        },
        {
          id: "s6_pool_clean",
          sectionIndex: 6,
          sectionName: "Pool & Spa",
          label: "Pool cleanliness",
          field: "rating",
          required: true,
        },
        {
          id: "s6_pool_water",
          sectionIndex: 6,
          sectionName: "Pool & Spa",
          label: "Water level",
          field: "choice",
          options: ["Full", "Low", "Empty"],
          required: true,
        },
      );
    }
    if (hasSpa) {
      out.push(
        photoQ("s6_spa_1", 6, "Pool & Spa", "Spa photo — angle 1", "SPA_1"),
        photoQ("s6_spa_2", 6, "Pool & Spa", "Spa photo — angle 2", "SPA_2"),
        {
          id: "s6_spa_location",
          sectionIndex: 6,
          sectionName: "Pool & Spa",
          label: "Spa location",
          field: "choice",
          options: ["Private", "Community"],
          required: true,
        },
        {
          id: "s6_spa_condition",
          sectionIndex: 6,
          sectionName: "Pool & Spa",
          label: "Spa condition",
          field: "rating",
          required: true,
        },
      );
    }
    return out;
  },
};

const S7: SectionDef = {
  index: 7,
  name: "Entry & First Impressions",
  resolve: () => [
    {
      id: "s7_hot_water",
      sectionIndex: 7,
      sectionName: "Entry & First Impressions",
      label: "Hot water confirmed working within 60 seconds at kitchen sink",
      helper: "Run the kitchen faucet on hot — confirm it reaches hot temperature within 60 seconds",
      field: "yesno",
      required: true,
      critical: true,
    },
    {
      id: "s7_gas_stove",
      sectionIndex: 7,
      sectionName: "Entry & First Impressions",
      label: "Gas stove flame confirmed working",
      helper: "Turn on each burner and confirm flame ignites properly",
      field: "yesno",
      required: true,
      critical: true,
    },
    {
      id: "s7_smells",
      sectionIndex: 7,
      sectionName: "Entry & First Impressions",
      label: "Any unusual smells detected",
      field: "yesno",
      required: true,
      followUp: {
        when: (v) => v === true,
        field: "text",
        required: true,
        label: "Location and description",
      },
    },
    {
      id: "s7_noises",
      sectionIndex: 7,
      sectionName: "Entry & First Impressions",
      label: "Any unusual noises detected",
      field: "yesno",
      required: true,
      followUp: {
        when: (v) => v === true,
        field: "text",
        required: true,
        label: "Location and description",
      },
    },
  ],
};

const S8: SectionDef = {
  index: 8,
  name: "Living Room",
  resolve: (ctx) => {
    const hasFireplace = ctx.config.fireplace === "Yes";
    const out: QuestionDef[] = [
      {
        ...photoQ("s8_mls", 8, "Living Room", "MLS-style wide photo", "LIVING_MLS"),
        helper: "Wide angle shot mimicking professional real estate photography — capture as much of the room as possible",
      },
      photoQ("s8_floor_photo", 8, "Living Room", "Flooring detail photo", "LIVING_FLOOR"),
    ];
    if (hasFireplace) {
      out.push(photoQ("s8_fireplace_photo", 8, "Living Room", "Fireplace detail photo", "LIVING_FIREPLACE"));
    }
    out.push(
      photoQ("s8_windows_photo", 8, "Living Room", "Windows and coverings photo", "LIVING_WINDOWS"),
      photoQ("s8_ceiling_photo", 8, "Living Room", "Ceiling and lighting photo", "LIVING_CEILING"),
      {
        id: "s8_floor_type",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Flooring type and condition",
        field: "text",
        required: true,
        withRating: true,
        notes: "optional",
        notesPlaceholder: "Describe stains, damage, smell and location",
      },
    );
    if (hasFireplace) {
      out.push({
        id: "s8_fireplace_type",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Fireplace type",
        field: "choice",
        options: ["Gas", "Wood", "Electric", "Combo", "Boarded or covered"],
        required: true,
      });
    }
    out.push(
      {
        id: "s8_window_type",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Window type",
        field: "choice",
        options: ["Single pane", "Dual pane"],
        required: true,
      },
      {
        id: "s8_window_condition",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Window condition",
        field: "rating",
        required: true,
        notes: "optional",
        notesPlaceholder: "Describe leaks, broken panes, missing screens and locations",
      },
      {
        id: "s8_window_coverings",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Window coverings condition",
        field: "choice",
        options: ["Good", "Needs cleaning", "Needs replacement"],
        required: true,
      },
      {
        id: "s8_lights",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Light fixtures condition",
        field: "rating",
        required: true,
        notes: "optional",
      },
      {
        id: "s8_baseboards",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Baseboards condition",
        field: "rating",
        required: true,
        notes: "required-if-rating-3",
        followUp: {
          when: (v) => v === 3,
          field: "photo",
          required: true,
          label: "Baseboard photo",
          photoName: "LIVING_BASEBOARDS",
        },
      },
      {
        id: "s8_paint",
        sectionIndex: 8,
        sectionName: "Living Room",
        label: "Interior paint condition",
        field: "rating",
        required: true,
        notes: "optional",
      },
    );
    return out;
  },
};

const S9: SectionDef = {
  index: 9,
  name: "Kitchen",
  resolve: () => [
    {
      ...photoQ("s9_mls", 9, "Kitchen", "MLS-style wide photo", "KITCHEN_MLS"),
      helper: "Wide angle, mimic professional real estate photography",
    },
    photoQ("s9_cab_closed", 9, "Kitchen", "Cabinets closed photo", "KITCHEN_CABINETS_CLOSED"),
    photoQ("s9_cab_open_1", 9, "Kitchen", "Cabinets open sample 1", "KITCHEN_CABINETS_OPEN_1"),
    photoQ("s9_cab_open_2", 9, "Kitchen", "Cabinets open sample 2", "KITCHEN_CABINETS_OPEN_2"),
    photoQ("s9_pantry", 9, "Kitchen", "Pantry photo", "KITCHEN_PANTRY"),
    photoQ("s9_bases", 9, "Kitchen", "Cabinet bases photo", "KITCHEN_BASES"),
    photoQ("s9_counters_photo", 9, "Kitchen", "Counters photo", "KITCHEN_COUNTERS"),
    photoQ("s9_sink_photo", 9, "Kitchen", "Kitchen sink and faucet photo", "KITCHEN_SINK"),
    {
      id: "s9_stove",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Stove and oven",
      field: "rating",
      required: true,
      withPhoto: { name: "KITCHEN_STOVE", min: 1 },
    },
    {
      id: "s9_fridge",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Refrigerator",
      field: "rating",
      required: true,
      withPhoto: { name: "KITCHEN_FRIDGE", min: 1 },
    },
    {
      id: "s9_dishwasher",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Dishwasher",
      field: "rating",
      required: true,
      withPhoto: { name: "KITCHEN_DISHWASHER", min: 1 },
    },
    {
      id: "s9_microwave",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Microwave present",
      field: "yesno",
      required: true,
      followUp: {
        when: (v) => v === true,
        field: "photo",
        required: true,
        label: "Microwave photo + rating",
        photoName: "KITCHEN_MICROWAVE",
      },
    },
    {
      id: "s9_microwave_rating",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Microwave condition",
      field: "rating",
      required: true,
      visible: (ctx) => ctx.answers["s9_microwave"]?.bool === true,
    },
    {
      id: "s9_cab_overall",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Cabinets overall condition",
      field: "rating",
      required: true,
    },
    {
      id: "s9_counters_cond",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Counters condition and material",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Describe material type",
    },
    {
      id: "s9_sink_cond",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Sink condition",
      field: "rating",
      required: true,
    },
    {
      id: "s9_faucet_cond",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Faucet condition",
      field: "rating",
      required: true,
    },
    {
      id: "s9_floor_cond",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Kitchen flooring condition",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Describe stains or damage",
    },
    {
      id: "s9_lights",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Light fixtures condition",
      field: "rating",
      required: true,
    },
    {
      id: "s9_baseboards",
      sectionIndex: 9,
      sectionName: "Kitchen",
      label: "Baseboards condition",
      field: "rating",
      required: true,
      followUp: {
        when: (v) => v === 3,
        field: "photo",
        required: true,
        label: "Baseboard photo",
        photoName: "KITCHEN_BASEBOARDS",
      },
    },
  ],
};

const S10: SectionDef = {
  index: 10,
  name: "Hallways",
  resolve: () => [
    {
      ...photoQ("s10_wide", 10, "Hallways", "Hallway wide photo", "HALLWAY"),
      helper: "Capture each hallway — add more photos if multiple hallways exist",
      maxPhotos: 3,
    },
    {
      id: "s10_floor",
      sectionIndex: 10,
      sectionName: "Hallways",
      label: "Hallway flooring condition",
      field: "rating",
      required: true,
    },
    {
      id: "s10_lights",
      sectionIndex: 10,
      sectionName: "Hallways",
      label: "Light fixtures condition",
      field: "rating",
      required: true,
    },
    {
      id: "s10_baseboards",
      sectionIndex: 10,
      sectionName: "Hallways",
      label: "Baseboards condition",
      field: "rating",
      required: true,
      followUp: {
        when: (v) => v === 3,
        field: "photo",
        required: true,
        label: "Baseboard photo",
        photoName: "HALLWAY_BASEBOARDS",
      },
    },
    {
      id: "s10_paint",
      sectionIndex: 10,
      sectionName: "Hallways",
      label: "Paint condition",
      field: "rating",
      required: true,
    },
  ],
};

function bathroomQuestions(n: number, total: number): QuestionDef[] {
  const tag = `Bathroom ${n} of ${total}`;
  const id = (k: string) => `s11_b${n}_${k}`;
  const pn = (k: string) => `BATHROOM${n}_${k}`;
  return [
    {
      id: id("type"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Bathroom type",
      field: "choice",
      options: ["Full bath", "Three-quarter bath", "Half bath"],
      required: true,
    },
    photoQ(id("mls"), 11, tag, "MLS-style wide photo", pn("MLS")),
    {
      ...photoQ(id("tub"), 11, tag, "Tub and surround photo", pn("TUB")),
      visible: (ctx) => ctx.answers[id("type")]?.choice === "Full bath",
    },
    {
      ...photoQ(id("shower"), 11, tag, "Standing shower photo", pn("SHOWER")),
      visible: (ctx) => {
        const t = ctx.answers[id("type")]?.choice;
        return t === "Full bath" || t === "Three-quarter bath";
      },
    },
    photoQ(id("sink"), 11, tag, "Sink and vanity photo", pn("SINK")),
    photoQ(id("toilet"), 11, tag, "Toilet photo", pn("TOILET")),
    {
      id: id("tub_cond"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Tub condition",
      field: "rating",
      required: true,
      visible: (ctx) => ctx.answers[id("type")]?.choice === "Full bath",
      followUp: {
        when: () => true,
        field: "multichoice",
        label: "Tub treatment (optional)",
        options: ["Needs reglaze", "Needs deep clean"],
      },
    },
    {
      id: id("shower_cond"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Shower condition",
      field: "rating",
      required: true,
      visible: (ctx) => {
        const t = ctx.answers[id("type")]?.choice;
        return t === "Full bath" || t === "Three-quarter bath";
      },
    },
    {
      id: id("sink_cond"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Sink and vanity condition",
      field: "rating",
      required: true,
    },
    {
      id: id("toilet_cond"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Toilet condition",
      field: "rating",
      required: true,
    },
    {
      id: id("floor"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Flooring condition",
      field: "rating",
      required: true,
      notes: "optional",
      notesPlaceholder: "Describe stains, damage, smell",
    },
    {
      id: id("window"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Window condition",
      field: "rating",
      required: true,
    },
    {
      id: id("coverings"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Window coverings condition",
      field: "choice",
      options: ["Good", "Needs cleaning", "Needs replacement", "No window"],
      required: true,
    },
    {
      id: id("lights"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Light fixtures condition",
      field: "rating",
      required: true,
    },
    {
      id: id("baseboards"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Baseboards condition",
      field: "rating",
      required: true,
    },
    {
      id: id("water_pooling"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Water pooling anywhere in bathroom",
      field: "yesno",
      required: true,
      critical: true,
      followUp: {
        when: (v) => v === true,
        field: "text",
        required: true,
        label: "Pooling location notes",
      },
    },
    {
      id: id("active_leaks"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Active leaks present",
      field: "yesno",
      required: true,
      critical: true,
      followUp: {
        when: (v) => v === true,
        field: "photo",
        required: true,
        label: "Leak photo + location notes",
        photoName: pn("LEAK"),
      },
    },
    {
      id: id("smells"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Any unusual smells",
      field: "yesno",
      required: true,
      followUp: {
        when: (v) => v === true,
        field: "text",
        required: true,
        label: "Smell location notes",
      },
    },
    {
      id: id("microbial"),
      sectionIndex: 11,
      sectionName: tag,
      label: "Microbial growth or discoloration",
      field: "yesno",
      required: true,
      critical: true,
      followUp: {
        when: (v) => v === true,
        field: "photo",
        required: true,
        label: "Mold photo + location notes",
        photoName: pn("MOLD"),
      },
    },
  ];
}

const S11: SectionDef = {
  index: 11,
  name: "Bathrooms",
  resolve: (ctx) => {
    const total = bathCount(ctx.config);
    if (total === 0) return [];
    const out: QuestionDef[] = [];
    for (let i = 1; i <= total; i++) out.push(...bathroomQuestions(i, total));
    return out;
  },
};

function bedroomQuestions(n: number, total: number): QuestionDef[] {
  const tag = `Bedroom ${n} of ${total}`;
  const id = (k: string) => `s12_b${n}_${k}`;
  const pn = (k: string) => `BEDROOM${n}_${k}`;
  return [
    {
      ...photoQ(id("mls"), 12, tag, "MLS-style wide photo", pn("MLS")),
      helper: "Wide angle, mimic professional real estate photography",
    },
    photoQ(id("closet"), 12, tag, "Closet door open photo", pn("CLOSET")),
    photoQ(id("windows"), 12, tag, "Windows photo", pn("WINDOWS")),
    {
      id: id("feature"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Unique feature photo",
      helper: "Capture any standout feature worth noting",
      field: "photo",
      required: false,
      photoName: pn("FEATURE"),
    },
    {
      id: id("floor"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Flooring condition",
      field: "rating",
      required: true,
    },
    {
      id: id("closet_cond"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Closet doors condition",
      field: "rating",
      required: true,
    },
    {
      id: id("window_cond"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Window condition",
      field: "rating",
      required: true,
    },
    {
      id: id("coverings"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Window coverings condition",
      field: "choice",
      options: ["Good", "Needs cleaning", "Needs replacement", "No covering"],
      required: true,
    },
    {
      id: id("lights"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Light fixtures condition",
      field: "rating",
      required: true,
    },
    {
      id: id("baseboards"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Baseboards condition",
      field: "rating",
      required: true,
      followUp: {
        when: (v) => v === 3,
        field: "photo",
        required: true,
        label: "Baseboard photo",
        photoName: pn("BASEBOARDS"),
      },
    },
    {
      id: id("paint"),
      sectionIndex: 12,
      sectionName: tag,
      label: "Paint condition",
      field: "rating",
      required: true,
    },
  ];
}

const S12: SectionDef = {
  index: 12,
  name: "Bedrooms",
  resolve: (ctx) => {
    const total = bedCount(ctx.config);
    if (total === 0) return [];
    const out: QuestionDef[] = [];
    for (let i = 1; i <= total; i++) out.push(...bedroomQuestions(i, total));
    return out;
  },
};

const S13: SectionDef = {
  index: 13,
  name: "Laundry",
  resolve: () => [
    photoQ("s13_wide", 13, "Laundry", "Laundry area wide photo", "LAUNDRY_WIDE"),
    photoQ("s13_hookups", 13, "Laundry", "Hookups close-up photo", "LAUNDRY_HOOKUPS"),
    {
      id: "s13_hookup_type",
      sectionIndex: 13,
      sectionName: "Laundry",
      label: "Hookup type",
      field: "choice",
      options: ["Gas", "Electric", "Both"],
      required: true,
    },
    {
      id: "s13_condition",
      sectionIndex: 13,
      sectionName: "Laundry",
      label: "Laundry condition",
      field: "rating",
      required: true,
    },
  ],
};

const S14: SectionDef = {
  index: 14,
  name: "Mechanical Systems",
  resolve: () => [
    photoQ("s14_hvac_photo", 14, "Mechanical Systems", "HVAC condenser photo", "HVAC_CONDENSER"),
    {
      id: "s14_hvac_loc",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "HVAC condenser location",
      helper: "Describe where the condenser is located (e.g., left side of house, backyard)",
      field: "text",
      required: true,
    },
    {
      id: "s14_hvac_cond",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "HVAC condition",
      field: "rating",
      required: true,
    },
    photoQ("s14_furnace_photo", 14, "Mechanical Systems", "Furnace photo", "FURNACE"),
    {
      id: "s14_furnace_loc",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Furnace location",
      field: "text",
      required: true,
    },
    {
      id: "s14_furnace_cond",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Furnace condition",
      field: "rating",
      required: true,
    },
    photoQ("s14_thermo_photo", 14, "Mechanical Systems", "Thermostat photo", "THERMOSTAT"),
    {
      id: "s14_thermo_loc",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Thermostat location",
      field: "text",
      required: true,
    },
    {
      id: "s14_thermo_type",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Thermostat type",
      field: "choice",
      options: ["Smart", "Manual"],
      required: true,
    },
    {
      id: "s14_thermo_cond",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Thermostat condition",
      field: "rating",
      required: true,
    },
    {
      id: "s14_wh_photo",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Water heater photo showing both straps clearly visible",
      helper: "Both safety straps must be clearly visible in the photo",
      field: "photo",
      required: true,
      minPhotos: 1,
      photoName: "WATERHEATER",
      critical: true,
    },
    {
      id: "s14_wh_loc",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Water heater location",
      field: "text",
      required: true,
    },
    {
      id: "s14_wh_strapped",
      sectionIndex: 14,
      sectionName: "Mechanical Systems",
      label: "Water heater confirmed double-strapped",
      helper: "Confirm both upper and lower straps are present and secured",
      field: "yesno",
      required: true,
      critical: true,
    },
  ],
};

const S15: SectionDef = {
  index: 15,
  name: "Video Walkthroughs",
  resolve: () => [
    {
      id: "s15_exterior_video",
      sectionIndex: 15,
      sectionName: "Video Walkthroughs",
      label: "Exterior walkthrough video",
      helper: "Record one continuous video: front → left side → back → right side. Narrate as you walk. Pan slowly.",
      field: "video",
      required: true,
      photoName: "EXTERIOR_WALKTHROUGH",
      minPhotos: 1,
    },
    {
      id: "s15_interior_video",
      sectionIndex: 15,
      sectionName: "Video Walkthroughs",
      label: "Interior walkthrough video",
      helper: "Record one continuous video through entire home. Begin at front door. Narrate each room as you enter. Detail all observations.",
      field: "video",
      required: true,
      photoName: "INTERIOR_WALKTHROUGH",
      minPhotos: 1,
    },
    {
      id: "s15_critical_videos",
      sectionIndex: 15,
      sectionName: "Video Walkthroughs",
      label: "Critical issue videos",
      helper: "Upload short videos of any critical issues flagged during the walkthrough",
      field: "video",
      required: false,
      photoName: "CRITICAL_VIDEO",
      maxPhotos: 5,
    },
  ],
};

const S16: SectionDef = {
  index: 16,
  name: "Miscellaneous",
  resolve: () => [
    {
      id: "s16_neighbors",
      sectionIndex: 16,
      sectionName: "Miscellaneous",
      label: "Neighbor connection notes",
      helper: "Any relevant info about or from neighbors",
      field: "longtext",
      required: false,
    },
    {
      id: "s16_trash",
      sectionIndex: 16,
      sectionName: "Miscellaneous",
      label: "Trash cans relocated before exterior photos",
      helper: "Confirm trash cans and other obstructions were moved before photographing the exterior",
      field: "yesno",
      required: true,
    },
    {
      id: "s16_other",
      sectionIndex: 16,
      sectionName: "Miscellaneous",
      label: "Anything else to note",
      helper: "Capture anything unusual not covered in the sections above",
      field: "longtext",
      required: false,
    },
  ],
};

// ---------- helper to build photo questions concisely ----------

function photoQ(
  id: string,
  sectionIndex: number,
  sectionName: string,
  label: string,
  photoName: string,
): QuestionDef {
  return {
    id,
    sectionIndex,
    sectionName,
    label,
    field: "photo",
    required: true,
    minPhotos: 1,
    photoName,
  };
}

export const SECTIONS: SectionDef[] = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15, S16];

// Final checklist (Section 17) is rendered by its own dedicated route.
export const FINAL_CHECKLIST_ITEMS: { id: string; label: string; visible?: (cfg: PreWalkConfig) => boolean }[] = [
  { id: "lights_off", label: "All interior lights turned off" },
  { id: "faucets_off", label: "All faucets confirmed off" },
  { id: "stove_off", label: "Gas stove confirmed off" },
  { id: "windows_locked", label: "All windows closed and locked" },
  { id: "doors_state", label: "All interior doors returned to original state" },
  { id: "front_back_locked", label: "Front and back doors locked" },
  { id: "garage_closed", label: "Garage door closed", visible: (c) => Boolean(c.garage && c.garage !== "None") },
  { id: "keys_returned", label: "Keys returned to lockbox" },
  { id: "lockbox_scrambled", label: "Lockbox closed and scrambled" },
];

// ---------- ordered question list across all sections ----------

export function buildQuestionList(ctx: SkipContext): QuestionDef[] {
  const list: QuestionDef[] = [];
  for (const s of SECTIONS) {
    for (const q of s.resolve(ctx)) {
      if (q.visible && !q.visible(ctx)) continue;
      list.push(q);
    }
  }
  return list;
}

// ---------- per-question completion check ----------

export function isQuestionAnswered(q: QuestionDef, ans: SkipContext["answers"][string] | undefined): boolean {
  if (!q.required && q.field !== "rating") {
    // optional fields don't block progress
    return true;
  }
  if (!ans) return !q.required;

  switch (q.field) {
    case "text":
      if (!q.required) return true;
      if (!ans.text || ans.text.trim().length === 0) return false;
      break;
    case "longtext":
      return true; // always optional in current schema
    case "number":
      if (q.required && (ans.number === undefined || Number.isNaN(ans.number))) return false;
      break;
    case "yesno":
      if (q.required && ans.bool === undefined) return false;
      break;
    case "choice":
      if (q.required && !ans.choice) return false;
      if (q.withRating && ans.rating === undefined) return false;
      break;
    case "multichoice":
      if (q.required && (!ans.choices || ans.choices.length === 0)) return false;
      break;
    case "rating":
      if (q.required && ans.rating === undefined) return false;
      // notes-required-if-3
      if (q.notes === "required-if-rating-3" && ans.rating === 3 && (!ans.notes || ans.notes.trim().length === 0)) {
        // notes are not strictly required-if-rating-3 in schema (followUp handles photo)
      }
      break;
    case "photo":
    case "video": {
      const min = q.minPhotos ?? (q.required ? 1 : 0);
      if ((ans.photos?.length ?? 0) < min) return false;
      break;
    }
  }

  // text-with-rating (e.g. flooring type and condition)
  if (q.field === "text" && q.withRating && ans.rating === undefined) return false;
  // rating-with-photo (e.g. stove)
  if (q.field === "rating" && q.withPhoto) {
    const min = q.withPhoto.min ?? 1;
    if ((ans.photos?.length ?? 0) < min) return false;
  }

  // follow-up validation
  if (q.followUp) {
    const parentVal = pickAnswerValue(q, ans);
    if (q.followUp.when(parentVal) && q.followUp.required) {
      const fu = q.followUp;
      if (fu.field === "text" && (!ans.notes || ans.notes.trim().length === 0)) return false;
      if (fu.field === "photo" && (ans.photos?.length ?? 0) < 1) return false;
    }
  }

  return true;
}

function pickAnswerValue(q: QuestionDef, ans: SkipContext["answers"][string]): AnswerValue {
  switch (q.field) {
    case "yesno":
      return ans.bool;
    case "rating":
      return ans.rating;
    case "choice":
      return ans.choice;
    case "multichoice":
      return ans.choices;
    case "text":
    case "longtext":
      return ans.text;
    case "number":
      return ans.number;
    default:
      return undefined;
  }
}

// Compute critical flags for completion record.
export function collectCriticalFlags(
  ctx: SkipContext,
): { questionId: string; label?: string; rating?: 1 | 2 | 3; notes?: string }[] {
  const out: { questionId: string; label?: string; rating?: 1 | 2 | 3; notes?: string }[] = [];
  const list = buildQuestionList(ctx);
  for (const q of list) {
    if (!q.critical) continue;
    const a = ctx.answers[q.id];
    if (!a) continue;
    // Critical yes/no items where Yes = problem are: water pooling, leaks,
    // microbial growth. Critical "must be true" items where No = problem are:
    // hot water, gas stove, water heater strapped.
    const yesIsProblem =
      q.id.includes("water_pooling") ||
      q.id.includes("active_leaks") ||
      q.id.includes("microbial");
    if (q.field === "yesno") {
      if (yesIsProblem && a.bool === true) out.push({ questionId: q.id, label: q.label, notes: a.notes });
      else if (!yesIsProblem && a.bool === false) out.push({ questionId: q.id, label: q.label, notes: a.notes });
    }
  }
  return out;
}
