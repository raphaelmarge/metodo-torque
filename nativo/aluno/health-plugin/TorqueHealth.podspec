Pod::Spec.new do |s|
  s.name = 'TorqueHealth'
  s.version = '0.1.0'
  s.summary = 'Read-only, opt-in health data for TORQUE ON Aluno'
  s.license = { :type => 'Proprietary' }
  s.homepage = 'https://www.torqueon.com.br'
  s.author = 'TORQUE ON'
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
  s.frameworks = 'HealthKit'
end
