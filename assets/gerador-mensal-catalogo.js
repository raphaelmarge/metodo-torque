/* Catálogo funcional do gerador mensal. Metadados de execução, não atestado clínico. */
(function (root, factory) {
  'use strict';
  var value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.MT_GERADOR_MENSAL_CATALOGO = value;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = '1.0.0';
  // Tags são contratos explícitos. Nunca derivar compatibilidade clínica do nome.
  function exercise(id, nome, grupo, pattern, equipment, position, requirements, complexity, muscles, unit, instructions) {
    return { id: 'gm-' + id, nome: nome, grupo: grupo, eq: equipment.join(', ') || 'Peso corporal',
      descricao: instructions, video: '', version: VERSION, modality: 'resistance', pattern: pattern,
      primaryMuscles: muscles, secondaryMuscles: [], equipment: equipment, position: position,
      requirements: requirements, complexity: complexity, lateral: 'bilateral',
      supports: position === 'seated' ? ['assento'] : position === 'supine' ? ['solo'] : [],
      range: 'Definida na revisão individual pelo personal', balance: position === 'standing' ? 'standing' : 'supported',
      unit: unit || 'kg', loadBasis: 'total', variation: id, incrementKg: null,
      metadata: { reviewed: true, author: 'Torque One — metadados iniciais do produto', date: '2026-10-23',
        reviewType: 'structural_seed', professionalReviewRequired: true,
        scope: 'Descrição estrutural inicial para conferência pelo personal; não recebeu revisão clínica externa. A adequação individual exige revisão antes de liberar.', clinicalValidation: false } };
  }
  var exercises = [
    exercise('agachar-cadeira', 'Sentar e levantar da cadeira', 'Quadríceps', 'knee', ['cadeira'], 'standing', ['legs_bilateral', 'standing', 'transfer'], 1, ['Quadríceps'], 'bodyweight', 'Cadeira estável; altura, amplitude e assistência definidas pelo personal.'),
    exercise('agachamento-livre', 'Agachamento livre com peso corporal', 'Quadríceps', 'knee', [], 'standing', ['legs_bilateral', 'standing'], 1, ['Quadríceps'], 'bodyweight', 'Executar na amplitude e com os apoios definidos pelo personal.'),
    exercise('agachamento-halter', 'Agachamento com halter à frente', 'Quadríceps', 'knee', ['halteres'], 'standing', ['legs_bilateral', 'standing', 'grip_bilateral'], 2, ['Quadríceps']),
    exercise('legpress', 'Leg press horizontal', 'Quadríceps', 'knee', ['leg_press'], 'seated', ['legs_bilateral', 'transfer'], 1, ['Quadríceps']),
    exercise('extensora', 'Extensão de joelhos na máquina', 'Quadríceps', 'knee', ['extensora'], 'seated', ['legs_bilateral', 'transfer'], 1, ['Quadríceps']),
    exercise('ponte', 'Ponte de quadril no solo', 'Posterior e glúteo', 'hip', ['colchonete'], 'supine', ['legs_bilateral', 'floor_transfer'], 1, ['Glúteos'], 'bodyweight'),
    exercise('flexora', 'Flexão de joelhos sentada na máquina', 'Posterior e glúteo', 'hip', ['flexora'], 'seated', ['legs_bilateral', 'transfer'], 1, ['Posteriores']),
    exercise('romeno-halteres', 'Levantamento romeno com halteres', 'Posterior e glúteo', 'hip', ['halteres'], 'standing', ['legs_bilateral', 'standing', 'grip_bilateral', 'hip_hinge'], 2, ['Posteriores']),
    exercise('flexao-parede', 'Flexão de braços na parede', 'Peito', 'push', ['parede'], 'standing', ['arms_bilateral', 'grip_bilateral', 'standing'], 1, ['Peito'], 'bodyweight'),
    exercise('supino-maquina', 'Supino sentado na máquina', 'Peito', 'push', ['supino_maquina'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Peito']),
    exercise('supino-halteres', 'Supino com halteres em banco plano', 'Peito', 'push', ['halteres', 'banco'], 'supine', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Peito']),
    exercise('supino-unilateral', 'Supino unilateral com halter em banco', 'Peito', 'push', ['halteres', 'banco'], 'supine', ['arm_single', 'grip_single', 'transfer'], 2, ['Peito']),
    exercise('remada-elastico', 'Remada sentada com elástico ancorado', 'Costas', 'pull', ['elastico', 'ancoragem', 'cadeira'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Costas']),
    exercise('remada-maquina', 'Remada sentada com apoio na máquina', 'Costas', 'pull', ['remada_maquina'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Costas']),
    exercise('remada-unilateral', 'Remada unilateral com halter e apoio', 'Costas', 'pull', ['halteres', 'banco'], 'standing', ['arm_single', 'grip_single', 'standing', 'support_arm'], 2, ['Costas']),
    exercise('remada-unilateral-cabo', 'Remada unilateral sentada no cabo', 'Costas', 'pull', ['polia', 'cadeira'], 'seated', ['arm_single', 'grip_single', 'transfer'], 2, ['Costas']),
    exercise('elevacao-lateral', 'Elevação lateral sentada com halteres', 'Ombros', 'shoulder', ['halteres', 'cadeira'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Ombros']),
    exercise('rosca-halteres', 'Rosca de braços sentada com halteres', 'Bíceps', 'arm_flexion', ['halteres', 'cadeira'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Bíceps']),
    exercise('triceps-polia', 'Extensão de cotovelos na polia', 'Tríceps', 'arm_extension', ['polia'], 'standing', ['arms_bilateral', 'grip_bilateral', 'standing'], 1, ['Tríceps']),
    exercise('deadbug', 'Dead bug no solo', 'Core', 'core', ['colchonete'], 'supine', ['arms_bilateral', 'legs_bilateral', 'floor_transfer'], 1, ['Core'], 'bodyweight'),
    exercise('pallof-sentado', 'Pressão anti-rotação sentada no cabo', 'Core', 'core', ['polia', 'cadeira'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Core']),
    exercise('panturrilha', 'Elevação de calcanhares com apoio', 'Panturrilhas', 'calf', ['apoio'], 'standing', ['legs_bilateral', 'standing', 'support_arm'], 1, ['Panturrilhas'], 'bodyweight')
  ];
  exercises.forEach(function (ex) { ex.descricao = ex.descricao || 'Carga, amplitude, posição e execução devem ser conferidas pelo personal antes da liberação.'; if (/unilateral/.test(ex.variation)) { ex.lateral = 'unilateral'; ex.loadBasis = 'per_side'; } });
  return { VERSION: VERSION, exercises: exercises, equipment: [
    'cadeira', 'halteres', 'banco', 'colchonete', 'parede', 'elastico', 'ancoragem', 'apoio',
    'polia', 'leg_press', 'extensora', 'flexora', 'supino_maquina', 'remada_maquina'
  ], functionalTags: ['legs_bilateral', 'arms_bilateral', 'arm_single', 'grip_bilateral', 'grip_single', 'standing', 'transfer', 'floor_transfer', 'hip_hinge', 'support_arm'] };
}));
