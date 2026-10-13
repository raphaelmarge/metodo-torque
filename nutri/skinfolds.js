// Density equations already used in personal.html, with explicit inputs and
// the original study age ranges. Skinfold measurements are in millimetres.
// References: https://pubmed.ncbi.nlm.nih.gov/718832/ (men, 18–61),
// https://pubmed.ncbi.nlm.nih.gov/7402053/ (women, 18–55), and
// https://periodicos.ufsm.br/kinesis/article/view/8617 (Guedes sample, Table 1).
// Guedes coefficients and completed-year ranges (men 17–27, women 17–29):
// Salem, Pires Neto & Waissmann (2007), p. 69, Tables 1–2:
// https://revistadeeducacaofisica.emnuvens.com.br/revista/article/download/336/365/1220
// Siri (1961): fat percentage = 495 / body density - 450.

const labels = Object.freeze({
 chest: 'Peitoral', midaxillary: 'Axilar média', triceps: 'Tricipital',
 subscapular: 'Subescapular', abdominal: 'Abdominal',
 suprailiac: 'Suprailíaca', thigh: 'Coxa', thighProximal: 'Coxa proximal'
});

function protocolDefinition(definition) {
 const sites = Object.freeze({
  M: Object.freeze([...definition.sites.M]),
  F: Object.freeze([...definition.sites.F])
 });
 const ageRanges = Object.freeze({
  M: Object.freeze([...definition.ageRanges.M]),
  F: Object.freeze([...definition.ageRanges.F])
 });
 return Object.freeze({...definition, sites, ageRanges});
}

export const SKINFOLD_PROTOCOLS = Object.freeze([
 protocolDefinition({
  id: 'p3', label: 'Pollock 3 dobras', ageRequired: true, usesAge: true,
  sites: {M: ['chest', 'abdominal', 'thigh'], F: ['triceps', 'suprailiac', 'thigh']},
  ageRanges: {M: [18, 61], F: [18, 55]},
  reference: 'Jackson e Pollock (1978), homens; Jackson, Pollock e Ward (1980), mulheres. Conversão de Siri (1961).',
  scopeNote: 'O estudo original recomenda cautela em mulheres acima de 40 anos. A técnica de coleta deve corresponder ao protocolo.'
 }),
 protocolDefinition({
  id: 'p7', label: 'Pollock 7 dobras', ageRequired: true, usesAge: true,
  sites: {
   M: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
   F: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh']
  },
  ageRanges: {M: [18, 61], F: [18, 55]},
  reference: 'Jackson e Pollock (1978), homens; Jackson, Pollock e Ward (1980), mulheres. Conversão de Siri (1961).',
  scopeNote: 'O estudo original recomenda cautela em mulheres acima de 40 anos. A técnica de coleta deve corresponder ao protocolo.'
 }),
 protocolDefinition({
  id: 'guedes', label: 'Guedes 3 dobras', ageRequired: true, usesAge: false,
  sites: {M: ['triceps', 'suprailiac', 'abdominal'], F: ['subscapular', 'suprailiac', 'thighProximal']},
  ageRanges: {M: [17, 27], F: [17, 29]},
  reference: 'Guedes (1985), equações reproduzidas em Salem, Pires Neto e Waissmann (2007), tabelas 1–2. Homens de 17 a 27 e mulheres de 17 a 29 anos completos. Conversão de Siri (1961).',
  scopeNote: 'No protocolo Guedes para mulheres, a dobra de coxa é proximal. Ela é uma medida distinta da coxa usada no Pollock.'
 })
]);

const failure = (code, error) => ({ok: false, code, error});
const missing = value => value == null || value === '';

export function calculateSkinfolds(input = {}) {
 const {protocol, sex, age, skinfolds} = input && typeof input === 'object' ? input : {};
 const definition = SKINFOLD_PROTOCOLS.find(item => item.id === protocol);
 if (!definition) return failure('UNKNOWN_PROTOCOL', 'Escolha um protocolo de dobras disponível.');
 if (sex !== 'M' && sex !== 'F') return failure('INVALID_SEX', 'Informe o sexo de referência da equação: masculino ou feminino.');

 const [minimumAge, maximumAge] = definition.ageRanges[sex];
 if (missing(age)) return failure('AGE_REQUIRED', definition.usesAge
  ? 'Informe a idade em anos completos para calcular pelo protocolo Pollock.'
  : `Informe a idade para conferir a faixa de ${minimumAge} a ${maximumAge} anos do protocolo Guedes. A idade não entra na equação.`);
 if (!Number.isInteger(age)) return failure('INVALID_AGE', 'Informe a idade em anos completos, como um número inteiro.');
 if (age < minimumAge || age > maximumAge) return failure('AGE_OUT_OF_RANGE',
  `${definition.label}: o cálculo automático está limitado à faixa de ${minimumAge} a ${maximumAge} anos da população estudada.`);

 if (!skinfolds || typeof skinfolds !== 'object' || Array.isArray(skinfolds)) {
  return failure('MISSING_SKINFOLDS', 'Preencha as dobras exigidas pelo protocolo, em milímetros.');
 }
 const sites = {};
 for (const key of definition.sites[sex]) {
  if (!Object.hasOwn(skinfolds, key) || missing(skinfolds[key])) return failure('MISSING_SKINFOLD', `Preencha a dobra ${labels[key]}, em milímetros.`);
  const value = skinfolds[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 150) {
   return failure('INVALID_SKINFOLD', `Confira a dobra ${labels[key]}: informe um número maior que zero e até 150 mm.`);
  }
  sites[key] = value;
 }

 const sum = Object.values(sites).reduce((total, value) => total + value, 0);
 let density;
 if (protocol === 'p3') {
  density = sex === 'M'
   ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age
   : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
 } else if (protocol === 'p7') {
  density = sex === 'M'
   ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age
   : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
 } else {
  density = sex === 'M'
   ? 1.17136 - 0.06706 * Math.log10(sum)
   : 1.1665 - 0.07063 * Math.log10(sum);
 }
 if (!Number.isFinite(density) || density <= 0) return failure('INVALID_RESULT', 'A densidade calculada não é válida. Confira as medidas e o protocolo.');
 const fat = 495 / density - 450;
 // The 80% ceiling belongs to the application's assessment field. It is not
 // a clinical validation threshold, and values are never clamped or rounded.
 if (!Number.isFinite(fat) || fat <= 0 || fat >= 80) return failure('INVALID_RESULT', 'O resultado está fora do intervalo aceito pelo cadastro de gordura corporal (maior que 0 e menor que 80%). Confira as medidas e o protocolo.');
 return {ok: true, protocol, sex, age, sum, density, fat, sites, formulaVersion: 1};
}
