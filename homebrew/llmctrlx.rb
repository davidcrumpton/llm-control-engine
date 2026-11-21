# Homebrew formula for llmctrlx.
#
# Generated against the v0.8.37 release assets. When a new release is cut, bump
# `version` and replace the four sha256 values with the contents of the
# published `.sha256` files (attached next to each tarball).
#
# To install from the tap, copy this file to davidcrumpton/homebrew-tap/Formula/
# as llmctrlx.rb; `brew install davidcrumpton/tap/llmctrlx` then works.
#
# The binaries are self-contained and do not need Node.js at runtime.
class Llmctrlx < Formula
  desc "Local LLM orchestration and execution CLI with tool and plugin support"
  homepage "https://github.com/davidcrumpton/llm-control-engine"
  version "0.8.37"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/davidcrumpton/llm-control-engine/releases/download/v#{version}/llmctrlx-#{version}-macos-arm64.tar.gz"
      sha256 "b568e1db114a1517df54bff95a7ea887c771ae849695db5c2db5abbab6e45d70"
    end

    on_intel do
      url "https://github.com/davidcrumpton/llm-control-engine/releases/download/v#{version}/llmctrlx-#{version}-macos-x64.tar.gz"
      sha256 "07412d5041bc38558261122e14507ba4b01fb6ee9e92a39c1d70fd63bc471d14"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/davidcrumpton/llm-control-engine/releases/download/v#{version}/llmctrlx-#{version}-linux-arm64.tar.gz"
      sha256 "47d4b392164dbebcb88b62bd4e3fd94777c850be672033a9c97d4e8a63bf0b1b"
    end

    on_intel do
      url "https://github.com/davidcrumpton/llm-control-engine/releases/download/v#{version}/llmctrlx-#{version}-linux-x64.tar.gz"
      sha256 "045903ab23c3e5f7d52e2ae5cb8cbf67c78920dab96cfd070051b0fb08776049"
    end
  end

  def install
    bin.install "llmctrlx"
    (pkgshare/"tools").install Dir["tools/*"]
    (pkgshare/"plugins").install Dir["plugins/*"]
    man1.install "man/llmctrlx.1"
  end

  def caveats
    <<~EOS
      Tools are NOT loaded by default. To use the bundled tools, point llmctrlx at the
      shared tools directory using -T or LLMCTRLX_TOOLS_DIR:

        export LLMCTRLX_TOOLS_DIR="#{pkgshare}/tools"
        llmctrlx chat -u "What time is it?"

      Or create your own tools folder and copy/create tools there:
        mkdir -p ~/my-tools
        cp #{pkgshare}/tools/datetime.js ~/my-tools/
        llmctrlx chat -T ~/my-tools -u "What time is it?"

      To use the bundled plugins, point llmctrlx at them the same way:

        export LLMCTRLX_PLUGINS_DIR="#{pkgshare}/plugins"

      Or copy them to your local plugins directory:
        mkdir -p ~/.llmctrlx_plugins
        cp #{pkgshare}/plugins/logger.plugin.cjs ~/.llmctrlx_plugins/
        cp #{pkgshare}/plugins/prompt-guard.plugin.cjs ~/.llmctrlx_plugins/
    EOS
  end

  test do
    assert_match "llmctrlx v#{version}", shell_output("#{bin}/llmctrlx version")
  end
end
