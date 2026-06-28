'use strict';

// Konverter-/Reglertyp zwischen PV-Modul und Messpunkt. Dessen Geräte-Wirkungsgrad
// geht ZUSÄTZLICH zum Anlagen-Wirkungsgrad in den Idealwert ein – ein MPPT-Laderegler
// arbeitet deutlich anders als ein 230-V-Wechselrichter.
//
// Temperatur: Die Geräte laufen etwa auf Außentemperaturniveau. Oberhalb der
// Referenztemperatur (25 °C, übliche Bezugstemperatur der Geräte-Nennwirkungsgrade)
// sinkt der Wirkungsgrad gemäß einem typ-spezifischen Temperaturkoeffizienten.
// Unterhalb der Referenz wird der Nennwirkungsgrad als Bestwert nicht überschritten.

const CONVERTER_REFERENCE_TEMPERATURE = 25;

// efficiency: Nennwirkungsgrad (0..1) bei 25 °C.
// tempCoeff: relative Wirkungsgrad-Änderung je °C oberhalb der Referenztemperatur.
const CONVERTER_TYPES = [
  { value: 'MPPT-Laderegler', label: 'MPPT-Solarladeregler', efficiency: 0.98, tempCoeff: -0.0005 },
  { value: 'PWM-Laderegler', label: 'PWM-Solarladeregler', efficiency: 0.80, tempCoeff: -0.0004 },
  { value: 'String-Wechselrichter', label: 'String-Wechselrichter (Netz)', efficiency: 0.97, tempCoeff: -0.0007 },
  { value: 'Hybrid-Wechselrichter', label: 'Hybrid-Wechselrichter (Netz/Batterie)', efficiency: 0.965, tempCoeff: -0.0007 },
  { value: 'Mikrowechselrichter', label: 'Mikro-/Modulwechselrichter', efficiency: 0.95, tempCoeff: -0.0010 },
  { value: 'Zentralwechselrichter', label: 'Zentralwechselrichter', efficiency: 0.985, tempCoeff: -0.0006 },
  { value: 'Inselwechselrichter', label: 'Insel-/Batteriewechselrichter (DC→230 V)', efficiency: 0.93, tempCoeff: -0.0008 },
  { value: 'Direkt', label: 'Kein Konverter / DC-Direktmessung', efficiency: 1.0, tempCoeff: 0 },
  { value: 'Sonstiges', label: 'Sonstiges', efficiency: 0.96, tempCoeff: -0.0007 },
];

// Auswahl für das Formular (Wert + Anzeige-Label).
const CONVERTER_TYPE_OPTIONS = CONVERTER_TYPES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

// Standard für neue Anlagen bzw. unbekannte Werte.
const DEFAULT_CONVERTER = CONVERTER_TYPES.find((entry) => entry.value === 'Direkt');

function getConverterParameters(converterType) {
  return CONVERTER_TYPES.find((entry) => entry.value === converterType) || DEFAULT_CONVERTER;
}

// Effektiver Konverter-Wirkungsgrad (0..1) bei gegebener Geräte-/Außentemperatur.
// Ohne Temperaturwert wird die Referenztemperatur (= Nennwirkungsgrad) angenommen.
function converterEfficiency(converterType, ambientTemperature) {
  const params = getConverterParameters(converterType);
  const temperature =
    ambientTemperature == null ? CONVERTER_REFERENCE_TEMPERATURE : ambientTemperature;
  const factor = 1 + params.tempCoeff * (temperature - CONVERTER_REFERENCE_TEMPERATURE);
  // Nennwirkungsgrad ist der Bestwert: oberhalb 25 °C Drosselung, darunter keine Überhöhung.
  return Math.max(0, Math.min(params.efficiency, params.efficiency * factor));
}

module.exports = {
  CONVERTER_TYPES,
  CONVERTER_TYPE_OPTIONS,
  CONVERTER_REFERENCE_TEMPERATURE,
  getConverterParameters,
  converterEfficiency,
};
