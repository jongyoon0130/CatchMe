require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'FuturemeAlarm'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'MIT'
  s.homepage = 'https://github.com/jongyoon0130/FutureMe-studio'
  s.author = 'Future Me'
  s.source = { :git => 'https://github.com/jongyoon0130/FutureMe-studio.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '26.0'
  s.dependency 'Capacitor'
  s.frameworks = 'AlarmKit', 'AppIntents'
  s.swift_version = '5.9'
end
