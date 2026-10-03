export type Address = {
  id: string;
  label: string;
  street: string;
  city: string;
  county?: string;
  postalCode?: string;
  /** The mobile saved with the address. Absent on addresses from before it existed. */
  phone?: string;
  isDefault?: boolean;
};
