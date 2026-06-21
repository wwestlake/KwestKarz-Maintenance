export const maintenanceTypes = [
  'Oil Change', 'Car Wash', 'Full Detail', 'Interior Detail', 'Exterior Detail',
  'Mechanical Repair', 'Damage Repair', 'Body Work', 'Paint / Touch Up', 'Tires',
  'Tire Rotation', 'Tire Repair', 'Wheel Alignment', 'Brake Inspection', 'Brake Pads',
  'Brake Rotors', 'Brake Fluid Flush', 'Transmission Flush', 'Coolant Flush', 'Battery',
  'Alternator', 'Starter', 'Wipers', 'Air Filter', 'Cabin Filter', 'Spark Plugs',
  'Suspension', 'A/C Service', 'Check Engine Diagnostic', 'OBD2 Scan', 'Emissions',
  'Inspection', 'Registration', 'Recall / Dealer Service', 'GPS / Bouncie Install',
  'Lock Box', 'Key / Fob', 'Roadside', 'Other',
]

export const lockBoxStyles = ['Mechanical Keypad', 'Dial', 'Other']
export const lockBoxStatuses = ['Available', 'Assigned', 'Lost', 'Retired']
export const complianceTypes = ['Registration', 'Insurance', 'LicensePlate']

export const rentalInspectionPhotoSlots = [
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['driverSide', 'Driver Side'],
  ['passengerSide', 'Passenger Side'],
  ['frontInterior', 'Front Interior'],
  ['rearInterior', 'Rear Interior'],
  ['trunkCargo', 'Trunk / Cargo'],
  ['odometerDashboard', 'Odometer / Dash'],
  ['damage', 'Damage Close-up'],
] as const

export const vehicleStatuses = ['Active', 'Inactive', 'In Shop', 'Staging', 'Sold']
