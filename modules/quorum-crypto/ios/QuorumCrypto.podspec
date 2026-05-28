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
  # MMKV + Channel.xcframework + uniffi channel.swift live in
  # QuorumChannelFFI so the iOS Notification Service Extension can
  # link just the Rust crypto surface without pulling in Expo.
  s.dependency 'QuorumChannelFFI'

  # Swift sources - just the Expo module here. FFI bindings come
  # from QuorumChannelFFI.
  s.source_files = "*.swift"
end
