/* Catálogo funcional do gerador mensal. Metadados de execução, não atestado clínico. */
(function (root, factory) {
  'use strict';
  var value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.MT_GERADOR_MENSAL_CATALOGO = value;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  // Tags são contratos explícitos. Nunca derivar compatibilidade clínica do nome.
  function exercise(id, nome, grupo, pattern, equipment, position, requirements, complexity, muscles, unit, instructions) {
    return { id: 'gm-' + id, nome: nome, grupo: grupo, eq: equipment.join(', ') || 'Peso corporal',
      descricao: instructions, video: '', version: '1.0.0', modality: 'resistance', pattern: pattern,
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
    exercise('panturrilha', 'Elevação de calcanhares com apoio', 'Panturrilhas', 'calf', ['apoio'], 'standing', ['legs_bilateral', 'standing', 'support_arm'], 1, ['Panturrilhas'], 'bodyweight'),
    exercise('agachamento-barra', 'Agachamento com barra no suporte', 'Quadríceps', 'knee', ['barra', 'anilhas', 'rack'], 'standing', ['legs_bilateral', 'standing', 'arms_bilateral', 'grip_bilateral'], 3, ['Quadríceps']),
    exercise('agachamento-smith', 'Agachamento no Smith', 'Quadríceps', 'knee', ['smith', 'anilhas'], 'standing', ['legs_bilateral', 'standing', 'arms_bilateral', 'grip_bilateral'], 2, ['Quadríceps']),
    exercise('afundo-halteres', 'Afundo estático com halteres', 'Quadríceps', 'knee', ['halteres'], 'standing', ['legs_bilateral', 'standing', 'grip_bilateral'], 2, ['Quadríceps']),
    exercise('legpress-45', 'Leg press 45 graus', 'Quadríceps', 'knee', ['leg_press_45', 'anilhas'], 'seated', ['legs_bilateral', 'transfer'], 1, ['Quadríceps']),
    exercise('mesa-flexora', 'Flexão de joelhos na mesa flexora', 'Posterior e glúteo', 'hip', ['mesa_flexora'], 'prone', ['legs_bilateral', 'transfer'], 1, ['Posteriores']),
    exercise('romeno-barra', 'Levantamento romeno com barra', 'Posterior e glúteo', 'hip', ['barra', 'anilhas'], 'standing', ['legs_bilateral', 'standing', 'grip_bilateral', 'hip_hinge'], 2, ['Posteriores']),
    exercise('elevacao-pelvica-halter', 'Elevação pélvica com halter e banco', 'Posterior e glúteo', 'hip', ['halteres', 'banco', 'colchonete'], 'supine', ['legs_bilateral', 'floor_transfer', 'grip_bilateral'], 2, ['Glúteos']),
    exercise('coice-polia', 'Extensão de quadril na polia com tornozeleira', 'Posterior e glúteo', 'hip', ['polia', 'tornozeleira', 'apoio'], 'standing', ['legs_bilateral', 'standing', 'support_arm'], 2, ['Glúteos']),
    exercise('supino-barra', 'Supino reto com barra', 'Peito', 'push', ['barra', 'anilhas', 'banco', 'rack'], 'supine', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Peito']),
    exercise('supino-inclinado-halteres', 'Supino inclinado com halteres', 'Peito', 'push', ['halteres', 'banco_regulavel'], 'supine', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Peito']),
    exercise('flexao-banco', 'Flexão de braços com as mãos no banco', 'Peito', 'push', ['banco'], 'inclined', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'standing'], 1, ['Peito'], 'bodyweight'),
    exercise('flexao-solo', 'Flexão de braços no solo', 'Peito', 'push', ['colchonete'], 'prone', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'floor_transfer'], 2, ['Peito'], 'bodyweight'),
    exercise('puxada-frente', 'Puxada pela frente na polia alta', 'Costas', 'pull', ['puxador'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Costas']),
    exercise('remada-baixa', 'Remada baixa no cabo', 'Costas', 'pull', ['remada_baixa'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Costas']),
    exercise('remada-curvada-halteres', 'Remada curvada com halteres', 'Costas', 'pull', ['halteres'], 'standing', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'standing', 'hip_hinge'], 2, ['Costas']),
    exercise('desenvolvimento-halteres', 'Desenvolvimento sentado com halteres', 'Ombros', 'shoulder', ['halteres', 'banco_regulavel'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Ombros']),
    exercise('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'Ombros', 'shoulder', ['desenvolvimento_maquina'], 'seated', ['arms_bilateral', 'grip_bilateral', 'transfer'], 1, ['Ombros']),
    exercise('elevacao-lateral-em-pe', 'Elevação lateral em pé com halteres', 'Ombros', 'shoulder', ['halteres'], 'standing', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'standing'], 1, ['Ombros']),
    exercise('rosca-barra', 'Rosca direta com barra', 'Bíceps', 'arm_flexion', ['barra', 'anilhas'], 'standing', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'standing'], 1, ['Bíceps']),
    exercise('rosca-polia', 'Rosca direta na polia', 'Bíceps', 'arm_flexion', ['polia'], 'standing', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'standing'], 1, ['Bíceps']),
    exercise('triceps-halter', 'Extensão de cotovelos deitado com halteres', 'Tríceps', 'arm_extension', ['halteres', 'banco'], 'supine', ['arms_bilateral', 'grip_bilateral', 'transfer'], 2, ['Tríceps']),
    exercise('triceps-elastico', 'Extensão de cotovelos com elástico ancorado', 'Tríceps', 'arm_extension', ['elastico', 'ancoragem'], 'standing', ['arms_bilateral', 'grip_bilateral', 'standing'], 1, ['Tríceps']),
    exercise('abdominal-solo', 'Flexão de tronco no colchonete', 'Core', 'core', ['colchonete'], 'supine', ['legs_bilateral', 'floor_transfer'], 1, ['Core'], 'bodyweight'),
    exercise('prancha-solo', 'Prancha com toque alternado nos ombros', 'Core', 'core', ['colchonete'], 'prone', ['arms_bilateral', 'grip_bilateral', 'legs_bilateral', 'floor_transfer'], 3, ['Core'], 'bodyweight', 'Repetições contadas por toque. Estabilidade, amplitude e execução conferidas pelo personal.'),
    exercise('panturrilha-halteres', 'Elevação de calcanhares com halteres', 'Panturrilhas', 'calf', ['halteres'], 'standing', ['legs_bilateral', 'standing', 'grip_bilateral'], 2, ['Panturrilhas']),
    exercise('panturrilha-sentada', 'Elevação de calcanhares sentada com halteres', 'Panturrilhas', 'calf', ['halteres', 'banco'], 'seated', ['legs_bilateral', 'grip_bilateral', 'transfer'], 1, ['Panturrilhas'])
  ];
  exercises.forEach(function (ex) { ex.descricao = ex.descricao || 'Carga, amplitude, posição e execução devem ser conferidas pelo personal antes da liberação.'; if (/unilateral/.test(ex.variation)) { ex.lateral = 'unilateral'; ex.loadBasis = 'per_side'; } });
  var equipmentLabels = {cadeira:'Cadeira estável',halteres:'Halteres',banco:'Banco reto',banco_regulavel:'Banco regulável',colchonete:'Colchonete',parede:'Parede',elastico:'Elástico',ancoragem:'Ancoragem para elástico',apoio:'Apoio estável',polia:'Polia / crossover',leg_press:'Leg press horizontal',leg_press_45:'Leg press 45 graus',extensora:'Cadeira extensora',flexora:'Cadeira flexora',mesa_flexora:'Mesa flexora',supino_maquina:'Máquina de supino',remada_maquina:'Máquina de remada',barra:'Barra',anilhas:'Anilhas',rack:'Suporte de barra com travas',smith:'Smith',puxador:'Puxador alto',remada_baixa:'Remada baixa',desenvolvimento_maquina:'Máquina de desenvolvimento',tornozeleira:'Tornozeleira para polia'};
  var functionalLabels = {legs_bilateral:'Uso das duas pernas',arms_bilateral:'Uso dos dois braços',arm_single:'Uso de um braço',grip_bilateral:'Preensão com as duas mãos',grip_single:'Preensão com uma mão',standing:'Permanecer em pé',transfer:'Entrar e sair do banco ou aparelho',floor_transfer:'Deitar no chão e levantar',hip_hinge:'Inclinar o tronco pelo quadril',support_arm:'Sustentar apoio com um braço'};
  // Sugestão de ambiente, nunca inventário confirmado nem liberação clínica.
  var standardGym = ['cadeira','halteres','banco','banco_regulavel','colchonete','parede','apoio','polia','leg_press','leg_press_45','extensora','flexora','mesa_flexora','supino_maquina','remada_maquina','barra','anilhas','rack','smith','puxador','remada_baixa','desenvolvimento_maquina'];
  return { VERSION: VERSION, exercises: exercises, equipment: Object.keys(equipmentLabels), equipmentLabels: equipmentLabels, functionalTags: Object.keys(functionalLabels), functionalLabels: functionalLabels, presets: {standard_gym:standardGym} };
}));
