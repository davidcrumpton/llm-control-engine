class Llmctrlx < Formula
  desc "LLM Control Engine - local LLM orchestration and execution CLI with tool and plugin support"
  homepage "https://github.com/davidcrumpton/llm-control-engine"
  url "https://registry.npmjs.org/llmctrlx/-/llmctrlx-0.7.82.tgz"
  sha256 "..."
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--production", "--ignore-scripts"
    bin.install "llmctrlx.js" => "llmctrlx"
    lib.install "plugins"   # Install plugins into the formula's lib directory
  end

  def caveats
    <<~EOS
      To use the plugins, copy them to your local plugins directory:
        mkdir -p ~/.llmctrlx_plugins
        cp -r #{HOMEBREW_PREFIX}/lib/plugins/* ~/.llmctrlx_plugins/
    EOS
  end

  test do
    assert_match "llmctrlx", shell_output("#{bin}/llmctrlx version")
  end
end