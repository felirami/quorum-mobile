require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# Minimal pod that exposes just the Rust crypto FFI (Channel.xcframework
# + uniffi-generated channel.swift) and MMKV access. Used by the iOS
# Notification Service Extension so the NSE can decrypt incoming
# hub-log pushes locally and decide whether to suppress notifications
# for control-type messages (update-profile, edit-message,
# remove-message).
#
# Why a separate podspec from QuorumCrypto: the main module depends on
# ExpoModulesCore, which an NSE can't safely link (forbidden APIs,
# bundle size). This pod has zero Expo dependencies — just MMKV + the
# Rust binding — so it's safe to install into an extension target.
#
# Both QuorumCrypto and QuorumChannelFFI vendor the SAME
# Channel.xcframework. Pods installs them into different target pod
# projects (main app vs NSE), so each target gets its own copy of the
# binary at link time. No duplicate-symbol risk because the two
# products are separately signed extension binaries.

Pod::Spec.new do |s|
  s.name           = 'QuorumChannelFFI'
  s.version        = package['version']
  s.summary        = 'Minimal Rust crypto FFI surface for the iOS Notification Service Extension'
  s.description    = 'Channel.xcframework + uniffi-generated channel.swift, no Expo dependencies'
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '13.4'
  s.swift_version  = '5.4'
  s.source         = { :git => 'https://github.com/quilibrium/quorum-mobile' }
  s.static_framework = true

  s.dependency 'MMKV', '2.2.4'

  # uniffi-generated Swift wrapper
  s.source_files = 'Bindings/channel.swift'

  # Channel Rust library
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
