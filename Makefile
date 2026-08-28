.PHONY: rules build zip

build:
	@rm -rf dist
	npx esbuild chrome/popup.bundle.js --bundle --minify --outfile=dist/popup.js
	rsync -av --exclude='src/' --exclude='node_modules/' --exclude='*.js' --exclude='package*' chrome/. dist/

zip:
	@rm -rf extension.zip
	@cd dist && zip -r ../extension.zip .
