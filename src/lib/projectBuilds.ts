/**
 * Project Builds — typed static data for the Mechanical Engineering Portfolio
 * Build System dashboard at /project-builds.
 *
 * Source: the June 30 mechanical-engineering portfolio build guide. Everything
 * here is local, typed, guide-backed content — no database, no API, no env.
 * Every project is framed as a Claude Code–assisted build.
 */

export type RealWorldValue = "Very high" | "High" | "Medium-high" | "Medium";

export type SkillCategory =
  | "Automotive"
  | "Thermal"
  | "Structural"
  | "CAD"
  | "Fabrication"
  | "Data / Instrumentation";

export interface ProjectBuild {
  /** stable slug used for selection, anchors, and detail panels */
  id: string;
  /** 1-based position in the dashboard display order */
  order: number;
  /** original guide project number — display order is 10, 8, 4, 3, 2, 1 */
  originalNumber: number;
  title: string;
  shortTitle: string;
  /** filter categories used by the category buttons */
  categories: SkillCategory[];
  /** portfolio-grade build definition */
  portfolioVersion: string;
  /** simplest credible version */
  simplestVersion: string;
  /** objective / purpose */
  purpose: string;
  realWorldUse: RealWorldValue;
  /** why the real-world use rating is what it is */
  realWorldNote: string;
  bestSignal: string;
  difficulty: "Easy" | "Easy to moderate" | "Moderate";
  cost: string;
  hoursLow: number;
  hoursHigh: number;
  primaryOutput: string;
  hiringSignal: string;
  /** scored 2 (easy) – 4 (moderate) for charting */
  difficultyScore: number;
  /** scored 2 (simplest) – 5 (highest fabrication complexity) for charting */
  complexityScore: number;
  engineeringPrinciples: string[];
  dataFields: string[];
  dashboardPanels: string[];
  requiredParts: string[];
  niceParts: string[];
  requiredMaterials: string[];
  niceMaterials: string[];
  requiredTools: string[];
  niceTools: string[];
  claudeOutputs: string[];
  deliverables: string[];
  resumeLine: string;
}

/** Real-world value → chart score. */
export const REAL_WORLD_SCORE: Record<RealWorldValue, number> = {
  "Very high": 5,
  High: 4,
  "Medium-high": 3.5,
  Medium: 3,
};

/** Universal deliverables every project detail section documents, in order. */
export const UNIVERSAL_DELIVERABLES: string[] = [
  "Objective",
  "Portfolio-grade build definition",
  "Simplest credible version",
  "Real-world use rating",
  "Engineering principles",
  "Required parts",
  "Required materials",
  "Required tools",
  "Nice-to-have parts/materials/tools",
  "Claude Code outputs",
  "Data fields",
  "Dashboard panels",
  "Final deliverables",
  "Estimated hours",
  "Resume line",
];

export const PROJECT_BUILDS: ProjectBuild[] = [
  {
    id: "suspension-kinematics",
    order: 1,
    originalNumber: 10,
    title: "Automotive Suspension Kinematics Model",
    shortTitle: "Suspension Kinematics Model",
    categories: ["Automotive", "CAD"],
    portfolioVersion:
      "Build a suspension geometry model that calculates camber change, motion ratio, roll-center behavior, and wheel-travel behavior from measured pickup points.",
    simplestVersion: "Measured suspension geometry + camber-versus-travel dashboard.",
    purpose: "Show how suspension geometry changes as the wheel moves through bump and rebound.",
    realWorldUse: "High",
    realWorldNote: "Mirrors chassis modeling and vehicle dynamics analysis.",
    bestSignal: "Automotive modeling, geometry, vehicle dynamics.",
    difficulty: "Moderate",
    cost: "Very low",
    hoursLow: 40,
    hoursHigh: 60,
    primaryOutput: "HTML dashboard with suspension geometry charts.",
    hiringSignal: "Chassis engineering, vehicle dynamics, analytical modeling.",
    difficultyScore: 4,
    complexityScore: 4,
    engineeringPrinciples: [
      "Suspension hardpoint (pickup-point) coordinate geometry in a fixed vehicle reference frame",
      "Front-view swing-arm geometry and instant-center construction for roll-center height",
      "Camber gain vs. wheel travel through bump and rebound",
      "Motion ratio — wheel travel vs. shock travel, and its effect on installed spring/damper rate",
      "Bump steer — toe change vs. wheel travel from tie-rod geometry",
      "Scrub radius and kingpin inclination at the front strut/knuckle",
      "Track-width change vs. wheel travel",
      "Anti-dive / anti-squat geometry from control-arm angles relative to the ground plane",
      "Coordinate-frame transformations for 3D linkage geometry",
      "Measurement uncertainty and how it propagates into camber and roll-center results",
    ],
    dataFields: [
      "project_id",
      "vehicle_name",
      "corner (front_left, front_right, rear_left, rear_right)",
      "suspension_type_front (e.g. MacPherson strut)",
      "suspension_type_rear (e.g. multi-link)",
      "coordinate_system",
      "wheel_travel_mm",
      "strut_top_mount_point (front corners only)",
      "upper_arm_inner_points (rear corners only)",
      "upper_arm_outer_point (rear corners only)",
      "lower_arm_inner_points",
      "lower_arm_outer_point",
      "tie_rod_inner_point",
      "tie_rod_outer_point",
      "wheel_center_point",
      "camber_deg",
      "motion_ratio",
      "roll_center_height_mm",
      "track_change_mm",
      "toe_change_deg",
      "assumptions",
    ],
    dashboardPanels: [
      "Project summary",
      "Coordinate table",
      "Suspension geometry diagram",
      "Camber-versus-travel chart",
      "Motion-ratio chart",
      "Roll-center movement chart",
      "Track-width / bump-steer panel",
      "Assumptions panel",
      "Final engineering interpretation",
    ],
    requiredParts: [
      "Your own vehicle (e.g. a Subaru Impreza — MacPherson strut front, multi-link rear), used only as the measurement subject",
      "One corner with a wheel removable for access (front and rear, ideally both)",
    ],
    niceParts: [
      "A second, different vehicle for comparison, to show the model generalizes beyond one car",
      "Access to a wheel alignment rack or scale pads to cross-check camber/toe readings",
    ],
    requiredMaterials: [
      "Painter's tape or a paint pen, to mark exact pickup points before measuring",
      "Fine-tip permanent marker for labeling reference points in photos",
      "Graph paper or a poster board, to sketch the geometry by hand before digitizing it",
    ],
    niceMaterials: ["Contrasting paint pen for photo visibility", "String and a small weight for an improvised plumb bob"],
    requiredTools: [
      "Floor jack and jack stands, to safely support the car with a wheel off and cycle suspension travel",
      "Wheel chocks",
      "Tape measure",
      "Dial or digital calipers",
      "Plumb bob",
      "Digital angle finder / inclinometer",
      "Computer running Claude Code, to turn the measurements into the geometry model and dashboard",
    ],
    niceTools: ["CAD package (Fusion 360, FreeCAD) to cross-check hand-calculated geometry", "Laser level", "Tripod-mounted camera for reference photos at each pickup point"],
    claudeOutputs: [
      "Pickup-point coordinate-table importer (CSV/JSON to typed records)",
      "Front-view swing-arm and instant-center geometry solver",
      "Camber-vs-travel calculator across the bump/rebound sweep",
      "Motion-ratio calculator from shock-mount and wheel-center geometry",
      "Roll-center height calculator, front and rear",
      "Bump-steer (toe-vs-travel) calculator, if tie-rod points are measured",
      "HTML dashboard with the geometry charts",
      "Assumptions/uncertainty panel documenting measured vs. estimated values",
      "One-page technical memo summarizing the results",
    ],
    deliverables: [
      "Pickup-point coordinate table",
      "Suspension geometry diagram",
      "HTML dashboard",
      "Camber chart",
      "Motion-ratio chart",
      "Roll-center chart",
      "Assumptions summary",
      "Final interpretation",
    ],
    resumeLine:
      "Developed a suspension kinematics model from measured vehicle geometry; analyzed camber gain, roll-center movement, and wheel-travel behavior using a Claude Code–assisted HTML dashboard.",
  },
  {
    id: "tool-organizer",
    order: 2,
    originalNumber: 8,
    title: "Modular Garage / Tool Organizer",
    shortTitle: "Modular Tool Organizer",
    categories: ["CAD", "Fabrication"],
    portfolioVersion:
      "Measure a tool set, define spacing and clearance rules, create a modular organizer, fabricate it, test the fit, and revise the design.",
    simplestVersion: "Measured tool organizer + fit-test dashboard.",
    purpose: "Show parametric design, tolerance control, usability, and iteration.",
    realWorldUse: "Medium",
    realWorldNote: "Shows parametric CAD, tolerances, and clean product execution.",
    bestSignal: "Product design, CAD, tolerances, rapid iteration.",
    difficulty: "Easy",
    cost: "Low",
    hoursLow: 15,
    hoursHigh: 25,
    primaryOutput: "Parametric organizer + dashboard showing measurements and fit results.",
    hiringSignal: "CAD discipline, tolerance thinking, clean product execution.",
    difficultyScore: 2,
    complexityScore: 2,
    engineeringPrinciples: [
      "Parametric design — driving pocket geometry from a small set of variables (tool diameter, spacing, base thickness)",
      "Direct measurement of tool dimensions with calipers",
      "Clearance/fit selection (running vs. close clearance) for each tool pocket",
      "Manufacturing tolerance and tolerance stack-up across repeated pockets",
      "Fit testing and iteration based on prototype results",
      "Modularity and interchangeable sections",
      "Design for the chosen manufacturing method (3D printing, laser cutting, or hand tools)",
      "Basic ergonomics of tool placement and retrieval",
    ],
    dataFields: [
      "project_id",
      "tool_set_name",
      "tool_count",
      "tool_id",
      "tool_type",
      "measured_diameter_mm",
      "measured_length_mm",
      "clearance_mm",
      "pocket_diameter_mm",
      "pocket_depth_mm",
      "spacing_mm",
      "base_thickness_mm",
      "label_text",
      "fit_result",
      "revision_number",
      "manufacturing_method",
      "final_status",
    ],
    dashboardPanels: [
      "Tool set summary",
      "Measurement table",
      "Clearance rules",
      "Organizer layout view",
      "Fit-test results",
      "Tolerance summary",
      "Prototype photo panel",
      "Revision notes",
      "Final manufacturing notes",
    ],
    requiredParts: [
      "Your own tool set to organize — the actual tools, measured one by one, not a generic placeholder",
      "Mounting hardware if wall-mounted (screws, French cleat, or similar)",
    ],
    niceParts: ["Modular interlocking sections", "Drawer insert base"],
    requiredMaterials: [
      "Sheet stock (plywood, MDF, or acrylic) or 3D-print filament — pick one based on what you can fabricate",
      "Wood screws or fasteners to assemble the body, if it isn't printed/cut as one piece",
      "Permanent marker or label material for pocket call-outs",
    ],
    niceMaterials: ["Label tape", "Color-coded inserts", "Felt or rubber lining"],
    requiredTools: [
      "Claude Code",
      "Computer",
      "CAD / parametric design software (Fusion 360, FreeCAD, or similar)",
      "Calipers",
      "A fabrication method matched to your material — 3D printer, laser cutter, table saw, or hand tools",
    ],
    niceTools: ["Laser cutter", "3D printer", "CNC router", "Label maker"],
    claudeOutputs: [
      "Tool measurement and clearance table generator",
      "Parametric layout calculator (pocket spacing, base size) driven by that table",
      "Cut list or print-parameter sheet for your chosen manufacturing method",
      "Fit-test tracking sheet across prototype revisions",
      "HTML dashboard with the measurement table, layout view, and fit results",
      "Revision-history summary",
    ],
    deliverables: [
      "Parametric CAD model or layout",
      "Fabricated organizer",
      "Measurement table",
      "Fit-test photos",
      "Tolerance chart",
      "Revision notes",
      "HTML dashboard",
      "Final drawings",
    ],
    resumeLine:
      "Designed a modular tool-storage system using Claude Code–assisted parametric layout, tolerance-controlled features, and rapid prototyping; iterated geometry based on fit and usability testing.",
  },
  {
    id: "camera-mount",
    order: 3,
    originalNumber: 4,
    title: "Vehicle Camera Mount with Vibration Isolation",
    shortTitle: "Vibration-Isolated Camera Mount",
    categories: ["Fabrication", "CAD", "Data / Instrumentation"],
    portfolioVersion:
      "Design and compare vehicle-mounted camera/phone brackets using accelerometer data and vibration metrics.",
    simplestVersion: "Two mount prototypes + vibration comparison dashboard.",
    purpose: "Reduce vibration transfer into a phone, camera, or sensor mount.",
    realWorldUse: "Medium-high",
    realWorldNote: "Shows vibration testing and design iteration.",
    bestSignal: "Design-build-test, vibration, damping, iteration.",
    difficulty: "Easy",
    cost: "Low",
    hoursLow: 25,
    hoursHigh: 40,
    primaryOutput: "Mount prototype + vibration dashboard.",
    hiringSignal: "Test discipline, product iteration, vibration awareness.",
    difficultyScore: 2,
    complexityScore: 3,
    engineeringPrinciples: [
      "Vibration transmissibility — how much input vibration reaches the mounted camera",
      "Mount stiffness and its effect on transmitted force",
      "Elastomeric damping (rubber isolators) and energy dissipation",
      "Natural frequency of the mount + camera system, and avoiding resonance with engine/road frequencies",
      "RMS and peak acceleration as vibration-severity metrics",
      "Frequency-domain (FFT) analysis to find the dominant vibration frequency",
      "Controlled A/B prototype comparison",
      "Test repeatability — same route, mounting, and conditions across runs",
    ],
    dataFields: [
      "project_id",
      "prototype_id",
      "mount_material",
      "damping_material",
      "test_condition",
      "time_sec",
      "ax",
      "ay",
      "az",
      "resultant_acceleration",
      "rms_acceleration",
      "peak_acceleration",
      "dominant_frequency_hz",
      "mount_deflection_mm",
      "camera_stability_score",
      "prototype_rank",
    ],
    dashboardPanels: [
      "Mount version summary",
      "Test route / condition summary",
      "RMS acceleration cards",
      "Peak acceleration cards",
      "Time-domain acceleration chart",
      "Frequency-content chart",
      "Prototype A versus Prototype B comparison",
      "Photo/video panel",
      "Design revision notes",
    ],
    requiredParts: [
      "Phone or camera",
      "Mount body",
      "An attachment point on your own vehicle's dash, windshield, or interior trim",
      "Fasteners",
      "Rubber grommets or damping pads",
    ],
    niceParts: ["GoPro-style adapter", "Ball joint", "Quick-release plate"],
    requiredMaterials: ["3D-print material or sheet material", "Rubber isolation material", "Fastener set"],
    niceMaterials: ["Threaded inserts", "Foam pads", "Cable clips"],
    requiredTools: [
      "Claude Code",
      "Computer",
      "CAD software (Fusion 360, FreeCAD, or similar) to design the mount bracket",
      "Phone accelerometer app (e.g. Physics Toolbox, Sensor Logger) or a standalone IMU module",
      "Phone or camera",
    ],
    niceTools: ["3D printer", "Calipers", "Tripod or rigging clamp", "Small screwdriver set"],
    claudeOutputs: [
      "Accelerometer CSV/log parser",
      "Resultant acceleration calculator from the three axes",
      "RMS and peak acceleration calculator per test run",
      "FFT / frequency-content calculator to find the dominant vibration frequency",
      "Prototype A vs. B comparison dashboard",
      "Test log and design-revision tracker",
    ],
    deliverables: [
      "CAD model",
      "Two or more prototypes",
      "Accelerometer data",
      "RMS comparison chart",
      "Frequency chart",
      "Final mounted photos",
      "Design revision notes",
      "HTML dashboard",
    ],
    resumeLine:
      "Designed and tested a vehicle camera mount with vibration isolation; used Claude Code–assisted accelerometer analysis to compare prototype stiffness, damping behavior, and image stability.",
  },
  {
    id: "bottle-jack",
    order: 4,
    originalNumber: 3,
    title: "Bottle Jack Press Fixture",
    shortTitle: "Bottle Jack Press Fixture",
    categories: ["Structural", "Fabrication", "CAD"],
    portfolioVersion:
      "Design and fabricate a compact hydraulic press fixture with a defined working load, structural analysis, and controlled validation.",
    simplestVersion: "CAD press frame + load-path calculation dashboard.",
    purpose: "Apply controlled compressive force for bearing, bushing, or small pressing operations.",
    realWorldUse: "High",
    realWorldNote: "Mirrors tooling, fixture design, fabrication, and safety-factor work.",
    bestSignal: "Structural design, fabrication, load path, factor of safety.",
    difficulty: "Moderate",
    cost: "Medium",
    hoursLow: 50,
    hoursHigh: 75,
    primaryOutput: "Fabricated press fixture + structural dashboard.",
    hiringSignal: "Manufacturing engineering, tooling, fabrication, mechanical design.",
    difficultyScore: 4,
    complexityScore: 5,
    engineeringPrinciples: [
      "Load path through the frame from the jack to the press plates",
      "Beam bending stress in the top and bottom crossmembers",
      "Column buckling in the side members under compressive load",
      "Bearing stress at the press-plate contact area",
      "Bolted or welded joint loading (shear, weld throat sizing)",
      "Deflection control under the rated load",
      "Factor of safety — design load vs. material yield strength",
      "Fabrication constraints (available stock sizes, weld access, drill press capacity)",
      "Controlled load testing to verify the calculated working load",
    ],
    dataFields: [
      "project_id",
      "jack_capacity_tons",
      "working_load_lb",
      "safety_factor_target",
      "span_length_in",
      "member_material",
      "yield_strength_psi",
      "elastic_modulus_psi",
      "tube_width_in",
      "tube_height_in",
      "wall_thickness_in",
      "bending_stress_psi",
      "estimated_deflection_in",
      "safety_factor_actual",
      "critical_member",
      "joint_type",
      "test_load_lb",
      "observed_deflection_in",
      "final_working_load_lb",
    ],
    dashboardPanels: [
      "Fixture overview",
      "Jack force input",
      "Frame member dimensions",
      "Bending stress output",
      "Deflection output",
      "Factor-of-safety card",
      "Load-path diagram",
      "CAD image panel",
      "Fabrication/test photo panel",
      "Working-load summary",
    ],
    requiredParts: [
      "Bottle jack",
      "Steel tube, channel, or plate",
      "Press plates",
      "Bolts or welded joints",
      "Frame crossmembers",
      "Side members",
    ],
    niceParts: ["Replaceable press pins", "Adjustable bed height", "Return springs", "Rubber feet"],
    requiredMaterials: ["Steel stock", "Fasteners", "Cutting layout", "Load-test notes", "CAD drawings"],
    niceMaterials: ["Paint or coating", "Rubber feet", "Warning/load label"],
    requiredTools: [
      "Claude Code",
      "Computer",
      "CAD software (Fusion 360, FreeCAD, or similar)",
      "Saw (chop saw or hacksaw)",
      "Drill press",
      "Tape measure, square, and calipers",
    ],
    niceTools: ["Welder", "Clamps", "Angle grinder", "Dial indicator", "Load cell"],
    claudeOutputs: [
      "Beam bending and deflection calculator for the chosen steel section",
      "Column buckling check for the side members",
      "Factor-of-safety calculator comparing applied vs. yield stress",
      "Steel section comparison table (tube vs. channel vs. plate options)",
      "HTML dashboard with the load-path diagram and stress/deflection results",
      "Test checklist for the controlled load validation",
      "One-page final engineering summary with the established working load",
    ],
    deliverables: [
      "CAD assembly",
      "Manufacturing drawing",
      "Load-path diagram",
      "Stress calculation",
      "Deflection calculation",
      "Safety-factor result",
      "Fabrication photos",
      "Controlled test photos",
      "Final working-load statement",
      "HTML dashboard",
    ],
    resumeLine:
      "Designed and fabricated a compact hydraulic press fixture for bearing and bushing installation; performed structural load-path analysis, frame sizing, material selection, and prototype testing to establish a practical working load.",
  },
  {
    id: "brake-rotor",
    order: 5,
    originalNumber: 2,
    title: "Brake Rotor Temperature Study",
    shortTitle: "Brake Rotor Temperature Study",
    categories: ["Automotive", "Thermal", "Data / Instrumentation"],
    portfolioVersion:
      "Run controlled braking tests, measure rotor temperatures, compare measured results to energy-balance predictions, and model cooling behavior.",
    simplestVersion: "Measured rotor temperature data + cooling dashboard.",
    purpose: "Show how braking converts vehicle kinetic energy into heat and how the rotor cools afterward.",
    realWorldUse: "Very high",
    realWorldNote: "Mirrors thermal validation and measured-versus-predicted engineering.",
    bestSignal: "Thermal analysis, test planning, measured-versus-predicted behavior.",
    difficulty: "Easy",
    cost: "Low",
    hoursLow: 25,
    hoursHigh: 35,
    primaryOutput: "Thermal dashboard with measured and predicted rotor behavior.",
    hiringSignal: "Thermal testing, validation, uncertainty discussion.",
    difficultyScore: 2,
    complexityScore: 3,
    engineeringPrinciples: [
      "Kinetic-to-thermal energy conversion during braking (1/2 · m · v²)",
      "Brake heat generation and the fraction of energy absorbed by the rotor vs. pads",
      "Thermal mass (rotor mass × specific heat) and its effect on temperature rise",
      "Convective cooling of the rotor after a stop",
      "First-order (Newton's law of cooling) decay modeling of the cooldown curve",
      "Measurement uncertainty in IR-thermometer readings (emissivity, angle, spot size)",
      "Test repeatability — consistent speed, ambient temperature, and braking method across runs",
    ],
    dataFields: [
      "project_id",
      "vehicle_mass_kg",
      "initial_speed_mph",
      "final_speed_mph",
      "ambient_temp_f",
      "rotor_temp_before_f",
      "rotor_temp_after_f",
      "time_sec",
      "rotor_temp_f",
      "rotor_mass_kg",
      "specific_heat",
      "braking_energy_j",
      "energy_to_rotor_fraction",
      "estimated_delta_temp_f",
      "measured_delta_temp_f",
      "cooling_rate",
      "cooling_time_constant",
      "error_sources",
    ],
    dashboardPanels: [
      "Test setup summary",
      "Vehicle mass / initial speed / ambient temperature",
      "Estimated braking energy",
      "Estimated rotor temperature rise",
      "Measured peak rotor temperature",
      "Cooling curve chart",
      "Estimate-versus-measured comparison",
      "Uncertainty and error-source panel",
    ],
    requiredParts: ["Your own vehicle (e.g. a Subaru Impreza) with accessible front brake rotors"],
    niceParts: ["A second vehicle for comparison", "Contact thermocouple for cross-checking the IR reading"],
    requiredMaterials: ["Painter's tape or a paint pen, to mark a consistent IR-thermometer aim point on the rotor"],
    niceMaterials: ["Rotor emissivity reference patch (flat black tape) for a more accurate IR reading"],
    requiredTools: [
      "Infrared (IR) thermometer or thermocouple — the core measurement instrument",
      "Stopwatch or a phone with timestamped video/voice recording",
      "Computer running Claude Code",
    ],
    niceTools: ["Calipers for rotor dimensions", "A second IR thermometer for validation", "Tripod-mounted camera"],
    claudeOutputs: [
      "Braking-energy calculator from mass and speed change",
      "Predicted temperature-rise estimator from the energy balance",
      "Cooling-curve fit (exponential decay) to the measured cooldown data",
      "CSV importer for the logged temperature readings",
      "HTML dashboard comparing measured vs. predicted temperature rise",
      "Error-source / uncertainty panel",
      "One-page thermal interpretation memo",
    ],
    deliverables: [
      "Controlled test plan",
      "Temperature data table",
      "Energy-balance calculation",
      "Cooling curve",
      "Estimate-versus-measured chart",
      "Error-source discussion",
      "HTML dashboard",
      "Final thermal interpretation",
    ],
    resumeLine:
      "Conducted brake rotor thermal characterization using controlled deceleration tests, energy-balance calculations, and temperature decay modeling; compared measured cooling behavior against first-order heat-transfer estimates.",
  },
  {
    id: "obd-logger",
    order: 6,
    originalNumber: 1,
    title: "OBD-II Vehicle Data Logger",
    shortTitle: "OBD-II Vehicle Data Logger",
    categories: ["Automotive", "Data / Instrumentation"],
    portfolioVersion:
      "Build a compact vehicle data-acquisition system that records live OBD-II data and presents drive-cycle behavior in an HTML dashboard.",
    simplestVersion: "Vehicle data logger + post-drive dashboard.",
    purpose: "Capture real vehicle data and turn it into clear engineering analysis.",
    realWorldUse: "Very high",
    realWorldNote: "Mirrors real vehicle testing and diagnostic workflows.",
    bestSignal: "Automotive systems, data acquisition, diagnostics, dashboard, packaging.",
    difficulty: "Easy to moderate",
    cost: "Low to medium",
    hoursLow: 45,
    hoursHigh: 55,
    primaryOutput: "OBD-II logger + HTML dashboard.",
    hiringSignal: "Automotive testing, data acquisition, system integration.",
    difficultyScore: 3,
    complexityScore: 4,
    engineeringPrinciples: [
      "Automotive diagnostics via the OBD-II PID protocol",
      "Data acquisition — sampling rate, timestamping, and buffering live sensor data",
      "Engine load and throttle response behavior",
      "Coolant/intake thermal behavior over a drive cycle",
      "Electrical-system monitoring (battery/alternator voltage under load)",
      "Data validation — flagging dropped samples or out-of-range readings",
      "Hardware packaging for an in-vehicle electronics setup",
    ],
    dataFields: [
      "project_id",
      "vehicle_name",
      "test_date",
      "route_type",
      "sampling_rate_hz",
      "timestamp",
      "rpm",
      "speed_mph",
      "coolant_temp_f",
      "intake_air_temp_f",
      "throttle_position_pct",
      "engine_load_pct",
      "fuel_trim_short_pct",
      "fuel_trim_long_pct",
      "voltage_v",
      "unsupported_channels",
      "missing_values",
      "test_duration_min",
      "total_rows",
    ],
    dashboardPanels: [
      "Vehicle/test summary",
      "Max RPM card",
      "Max speed card",
      "Coolant temperature range card",
      "Intake temperature range card",
      "Voltage range card",
      "Speed/RPM/throttle chart",
      "Coolant/intake temperature chart",
      "Engine load chart",
      "Fuel-trim chart",
      "Data-quality panel",
    ],
    requiredParts: [
      "ELM327-compatible OBD-II adapter",
      "Your own vehicle (e.g. a Subaru Impreza — OBD-II is standard on all US-market cars from 1996 on)",
      "Laptop or small computer",
      "Adapter connection method: USB, Bluetooth, or Wi-Fi",
    ],
    niceParts: [
      "OBD-II extension cable",
      "Enclosure or electronics housing",
      "Mounting base or bracket",
      "Display device",
    ],
    requiredMaterials: ["Zip ties or cable clips, to route the adapter/laptop cable safely in the cabin"],
    niceMaterials: ["Electrical tape", "Branded project label for the enclosure"],
    requiredTools: ["Claude Code", "Computer or laptop", "Phone or camera, to document the install"],
    niceTools: [
      "CAD workflow",
      "3D printer or project-box modification tools",
      "Calipers or ruler",
      "Screwdriver set",
      "Drill or rotary tool",
      "Flush cutters or scissors",
      "Label maker",
      "External monitor",
      "Printer",
    ],
    claudeOutputs: [
      "Data logger",
      "CSV data structure",
      "Error-handling logic",
      "Data cleanup process",
      "HTML dashboard",
      "Dashboard styling",
      "Dashboard charts",
      "Dashboard summary cards",
      "Setup instructions",
      "Test checklist",
      "README / project documentation",
      "Final project folder",
    ],
    deliverables: [
      "Working OBD-II data logger",
      "Real drive-cycle data file",
      "HTML dashboard",
      "Dashboard screenshots",
      "Two to four clean charts inside the dashboard",
      "Photo of installed setup",
      "Block diagram",
      "Enclosure or mounting concept",
      "Test procedure",
      "One-page engineering summary",
      "Claude Code build appendix",
    ],
    resumeLine:
      "Designed and built an OBD-II vehicle data acquisition system with a Claude Code–assisted HTML dashboard, real drive-cycle data capture, hardware packaging, and engineering analysis of engine, thermal, electrical, and vehicle operating behavior.",
  },
];

export interface ProjectBuildSummary {
  totalProjects: number;
  totalHoursLow: number;
  totalHoursHigh: number;
  totalHoursLabel: string;
  highestValueProject: string;
  fastestProject: string;
  strongestFabricationProject: string;
  strongestThermalProject: string;
  strongestModelingProject: string;
  strongestDesignBuildTestProject: string;
  softwareUmbrella: string;
  dashboardFormat: string;
}

export const PROJECT_BUILD_SUMMARY: ProjectBuildSummary = {
  totalProjects: PROJECT_BUILDS.length,
  totalHoursLow: PROJECT_BUILDS.reduce((sum, p) => sum + p.hoursLow, 0),
  totalHoursHigh: PROJECT_BUILDS.reduce((sum, p) => sum + p.hoursHigh, 0),
  totalHoursLabel: "200–290",
  highestValueProject: "OBD-II Vehicle Data Logger",
  fastestProject: "Modular Garage / Tool Organizer",
  strongestFabricationProject: "Bottle Jack Press Fixture",
  strongestThermalProject: "Brake Rotor Temperature Study",
  strongestModelingProject: "Suspension Kinematics Model",
  strongestDesignBuildTestProject: "Vehicle Camera Mount with Vibration Isolation",
  softwareUmbrella: "Claude Code–assisted",
  dashboardFormat: "HTML dashboard",
};

export interface RankingRow {
  rank: number;
  projectId: string;
  project: string;
  rating: string;
  /** chart score for the bar visualisation */
  score: number;
  note: string;
}

export const REAL_WORLD_RANKING: RankingRow[] = [
  {
    rank: 1,
    projectId: "obd-logger",
    project: "OBD-II Vehicle Data Logger",
    rating: "Very high",
    score: 5,
    note: "Mirrors real vehicle testing and diagnostic workflows.",
  },
  {
    rank: 2,
    projectId: "brake-rotor",
    project: "Brake Rotor Temperature Study",
    rating: "Very high",
    score: 5,
    note: "Mirrors thermal validation and measured-versus-predicted engineering.",
  },
  {
    rank: 3,
    projectId: "bottle-jack",
    project: "Bottle Jack Press Fixture",
    rating: "High",
    score: 4,
    note: "Mirrors tooling, fixture design, fabrication, and safety-factor work.",
  },
  {
    rank: 4,
    projectId: "suspension-kinematics",
    project: "Suspension Kinematics Model",
    rating: "High",
    score: 4,
    note: "Mirrors chassis modeling and vehicle dynamics analysis.",
  },
  {
    rank: 5,
    projectId: "camera-mount",
    project: "Vehicle Camera Mount with Vibration Isolation",
    rating: "Medium-high",
    score: 3.5,
    note: "Shows vibration testing and design iteration.",
  },
  {
    rank: 6,
    projectId: "tool-organizer",
    project: "Modular Garage / Tool Organizer",
    rating: "Medium",
    score: 3,
    note: "Shows parametric CAD, tolerances, and clean product execution.",
  },
];

export const COMPLEXITY_RANKING: RankingRow[] = [
  {
    rank: 1,
    projectId: "bottle-jack",
    project: "Bottle Jack Press Fixture",
    rating: "Highest",
    score: 5,
    note: "Highest physical fabrication complexity.",
  },
  {
    rank: 2,
    projectId: "obd-logger",
    project: "OBD-II Vehicle Data Logger",
    rating: "Strong",
    score: 4,
    note: "Strong system integration complexity.",
  },
  {
    rank: 3,
    projectId: "suspension-kinematics",
    project: "Suspension Kinematics Model",
    rating: "Strong",
    score: 4,
    note: "Strong analytical/modeling complexity.",
  },
  {
    rank: 4,
    projectId: "camera-mount",
    project: "Vehicle Camera Mount with Vibration Isolation",
    rating: "Moderate",
    score: 3,
    note: "Moderate prototype/testing complexity.",
  },
  {
    rank: 5,
    projectId: "brake-rotor",
    project: "Brake Rotor Temperature Study",
    rating: "Moderate",
    score: 3,
    note: "Moderate test-method complexity.",
  },
  {
    rank: 6,
    projectId: "tool-organizer",
    project: "Modular Garage / Tool Organizer",
    rating: "Simplest",
    score: 2,
    note: "Fastest and simplest execution.",
  },
];

export interface BuildSequenceStep {
  step: number;
  projectId: string;
  project: string;
  rationale: string;
}

export const BUILD_SEQUENCE: BuildSequenceStep[] = [
  {
    step: 1,
    projectId: "tool-organizer",
    project: "Modular Garage / Tool Organizer",
    rationale: "Fast win; establishes dashboard format and visual system.",
  },
  {
    step: 2,
    projectId: "camera-mount",
    project: "Vehicle Camera Mount with Vibration Isolation",
    rationale: "Fast design-build-test project with visual proof.",
  },
  {
    step: 3,
    projectId: "brake-rotor",
    project: "Brake Rotor Temperature Study",
    rationale: "Adds real test data and thermal analysis.",
  },
  {
    step: 4,
    projectId: "obd-logger",
    project: "OBD-II Vehicle Data Logger",
    rationale: "Strongest system/dashboard project.",
  },
  {
    step: 5,
    projectId: "suspension-kinematics",
    project: "Suspension Kinematics Model",
    rationale: "Adds serious automotive modeling.",
  },
  {
    step: 6,
    projectId: "bottle-jack",
    project: "Bottle Jack Press Fixture",
    rationale: "Strong final structural/fabrication project.",
  },
];

export interface SkillCoverageRow {
  skill: string;
  /** project ids the skill maps to */
  projectIds: string[];
  /** short project labels for display */
  projects: string[];
  /** true when the skill is covered by every project */
  all: boolean;
}

export const SKILL_COVERAGE: SkillCoverageRow[] = [
  {
    skill: "Automotive systems",
    projectIds: ["obd-logger", "suspension-kinematics", "brake-rotor"],
    projects: ["OBD-II", "Suspension", "Brake Rotor"],
    all: false,
  },
  {
    skill: "Thermal analysis",
    projectIds: ["brake-rotor"],
    projects: ["Brake Rotor"],
    all: false,
  },
  {
    skill: "Structural design",
    projectIds: ["bottle-jack"],
    projects: ["Bottle Jack"],
    all: false,
  },
  {
    skill: "Fabrication",
    projectIds: ["bottle-jack", "camera-mount", "tool-organizer"],
    projects: ["Bottle Jack", "Camera Mount", "Tool Organizer"],
    all: false,
  },
  {
    skill: "Vibration testing",
    projectIds: ["camera-mount"],
    projects: ["Camera Mount"],
    all: false,
  },
  {
    skill: "CAD",
    projectIds: ["suspension-kinematics", "tool-organizer", "camera-mount", "bottle-jack"],
    projects: ["Suspension", "Tool Organizer", "Camera Mount", "Bottle Jack"],
    all: false,
  },
  {
    skill: "Instrumentation/data",
    projectIds: ["obd-logger", "brake-rotor", "camera-mount"],
    projects: ["OBD-II", "Brake Rotor", "Camera Mount"],
    all: false,
  },
  {
    skill: "Test planning",
    projectIds: PROJECT_BUILDS.map((p) => p.id),
    projects: ["All six"],
    all: true,
  },
  {
    skill: "Dashboard communication",
    projectIds: PROJECT_BUILDS.map((p) => p.id),
    projects: ["All six"],
    all: true,
  },
  {
    skill: "Portfolio storytelling",
    projectIds: PROJECT_BUILDS.map((p) => p.id),
    projects: ["All six"],
    all: true,
  },
];

/** Filter categories exposed by the dashboard, in button order. */
export const PROJECT_FILTERS: Array<"All" | SkillCategory> = [
  "All",
  "Automotive",
  "Thermal",
  "Structural",
  "CAD",
  "Fabrication",
  "Data / Instrumentation",
];

/** Lookup a project by id. */
export function getProjectBuild(id: string): ProjectBuild | undefined {
  return PROJECT_BUILDS.find((p) => p.id === id);
}
