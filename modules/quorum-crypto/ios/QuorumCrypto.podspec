require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'QuorumCrypto'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '13.4'
  s.swift_version  = '5.4'
  s.source         = { :git => 'https://github.com/quilibrium/quorum-mobile' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift sources - Expo module and uniffi-generated bindings
  s.source_files = "*.swift", "Bindings/*.swift"

  # Channel Rust library (uniffi-generated XCFramework)
  s.vendored_frameworks = 'Frameworks/Channel.xcframework'

  # Module map for FFI headers (channelFFI module from uniffi)
  s.preserve_paths = 'Bindings/module.modulemap', 'Bindings/channelFFI.h'
  s.pod_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => '$(PODS_TARGET_SRCROOT)/Bindings',
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/Bindings',
    'OTHER_CFLAGS' => '-fmodule-map-file="$(PODS_TARGET_SRCROOT)/Bindings/module.modulemap"'
  }
  s.user_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => '$(PODS_ROOT)/../../modules/quorum-crypto/ios/Bindings',
    'HEADER_SEARCH_PATHS' => '$(PODS_ROOT)/../../modules/quorum-crypto/ios/Bindings'
  }
end
