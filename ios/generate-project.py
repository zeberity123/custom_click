"""Generate the dependency-free Xcode project and copy the shared offline web assets."""
from pathlib import Path
import hashlib, json, shutil
root = Path(__file__).resolve().parent
web = root / 'web'
shutil.copytree(root.parent / 'src', web, dirs_exist_ok=True)
objects = {}
def ident(name): return hashlib.sha1(name.encode()).hexdigest()[:24].upper()
def quote(value): return json.dumps(str(value))
def add(name, value):
    key=ident(name);objects[key]=value;return key
def ids(values): return '('+','.join(values)+',)' if values else '()'
def ref(name, path, kind): return add(name, f'isa=PBXFileReference;path={quote(path)};sourceTree="<group>";lastKnownFileType={kind};')
sources=[];children=[]
for name,kind in [('AppDelegate.swift','sourcecode.swift'),('AssetServer.swift','sourcecode.swift'),('ClickViewController.swift','sourcecode.swift'),('ClickAudio.mm','sourcecode.cpp.objcpp')]:
    key=ref(name,'Click/'+name,kind);children.append(key)
    sources.append(add('build-'+name,f'isa=PBXBuildFile;fileRef={key};'))
for name in ['ClickAudio.h','Click-Bridging-Header.h','RhythmDSP.hpp']:
    children.append(ref(name,'Click/'+name,'sourcecode.c.h'))
children.append(ref('plist','Click/Info.plist','text.plist.xml'))
resources=[]
for name,kind in [('web','folder'),('Assets.xcassets','folder.assetcatalog')]:
    key=ref(name,name,kind);children.append(key)
    resources.append(add('build-'+name,f'isa=PBXBuildFile;fileRef={key};'))
app=add('product','isa=PBXFileReference;explicitFileType=wrapper.application;path=Click.app;sourceTree=BUILT_PRODUCTS_DIR;')
testapp=add('testproduct','isa=PBXFileReference;explicitFileType=wrapper.cfbundle;path=ClickUITests.xctest;sourceTree=BUILT_PRODUCTS_DIR;')
testfile=ref('testfile','Tests/ClickUITests.swift','sourcecode.swift');children.append(testfile)
testbuild=add('testbuild',f'isa=PBXBuildFile;fileRef={testfile};')
products=add('products',f'isa=PBXGroup;name=Products;children={ids([app,testapp])};sourceTree="<group>";')
group=add('group',f'isa=PBXGroup;children={ids(children+[products])};sourceTree="<group>";')
def phase(name,isa,files): return add(name,f'isa={isa};buildActionMask=2147483647;files={ids(files)};runOnlyForDeploymentPostprocessing=0;')
sourcephase=phase('sources','PBXSourcesBuildPhase',sources)
resourcephase=phase('resources','PBXResourcesBuildPhase',resources)
frameworkphase=phase('frameworks','PBXFrameworksBuildPhase',[])
testphase=phase('testsources','PBXSourcesBuildPhase',[testbuild])
def settings(values): return '{'+''.join(f'{key}={quote(value)};' for key,value in values.items())+'}'
common={'IPHONEOS_DEPLOYMENT_TARGET':'18.0','SDKROOT':'iphoneos','CLANG_ENABLE_MODULES':'YES','CLANG_ENABLE_OBJC_ARC':'YES','CLANG_CXX_LANGUAGE_STANDARD':'c++17','SWIFT_VERSION':'5.0','TARGETED_DEVICE_FAMILY':'1,2','CODE_SIGN_STYLE':'Automatic','ENABLE_USER_SCRIPT_SANDBOXING':'YES'}
def configs(name,extra):
    values=[]
    for mode in ['Debug','Release']:
        config={**common,**extra,'SWIFT_OPTIMIZATION_LEVEL':'-Onone' if mode=='Debug' else '-O','GCC_OPTIMIZATION_LEVEL':'0' if mode=='Debug' else 's','DEBUG_INFORMATION_FORMAT':'dwarf-with-dsym'}
        if mode=='Debug':config['ENABLE_TESTABILITY']='YES'
        values.append(add(name+mode,f'isa=XCBuildConfiguration;name={mode};buildSettings={settings(config)};'))
    return add(name+'configs',f'isa=XCConfigurationList;buildConfigurations={ids(values)};defaultConfigurationIsVisible=0;defaultConfigurationName=Release;')
projectconfig=configs('project',{})
appconfig=configs('app',{'PRODUCT_BUNDLE_IDENTIFIER':'com.zeberity123.customclick','PRODUCT_NAME':'Click','INFOPLIST_FILE':'Click/Info.plist','SWIFT_OBJC_BRIDGING_HEADER':'Click/Click-Bridging-Header.h','ASSETCATALOG_COMPILER_APPICON_NAME':'AppIcon','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','SUPPORTS_MACCATALYST':'NO'})
testconfig=configs('test',{'PRODUCT_BUNDLE_IDENTIFIER':'com.zeberity123.customclick.uitests','PRODUCT_NAME':'ClickUITests','GENERATE_INFOPLIST_FILE':'YES','TEST_TARGET_NAME':'Click'})
target=add('target',f'isa=PBXNativeTarget;name=Click;productName=Click;productReference={app};productType="com.apple.product-type.application";buildConfigurationList={appconfig};buildPhases={ids([sourcephase,frameworkphase,resourcephase])};dependencies=();buildRules=();')
proxy=add('proxy',f'isa=PBXContainerItemProxy;containerPortal={ident("project")};proxyType=1;remoteGlobalIDString={target};remoteInfo=Click;')
dependency=add('dependency',f'isa=PBXTargetDependency;target={target};targetProxy={proxy};')
testtarget=add('testtarget',f'isa=PBXNativeTarget;name=ClickUITests;productName=ClickUITests;productReference={testapp};productType="com.apple.product-type.bundle.ui-testing";buildConfigurationList={testconfig};buildPhases={ids([testphase])};dependencies={ids([dependency])};buildRules=();')
project=add('project',f'isa=PBXProject;attributes={{LastUpgradeCheck=1600;TargetAttributes={{{testtarget}={{TestTargetID={target};}};}};}};buildConfigurationList={projectconfig};compatibilityVersion="Xcode 14.0";developmentRegion=en;knownRegions=(en,Base);mainGroup={group};productRefGroup={products};projectDirPath="";projectRoot="";targets={ids([target,testtarget])};')
folder=root/'Click.xcodeproj';folder.mkdir(exist_ok=True)
(folder/'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion=1;classes={};objectVersion=56;objects={\n'+''.join(f'{k}={{{v}}};\n' for k,v in objects.items())+'};rootObject='+project+';}\n',encoding='utf-8')
scheme=folder/'xcshareddata/xcschemes';scheme.mkdir(parents=True,exist_ok=True)
def buildref(key,name):return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{key}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:Click.xcodeproj"/>'
(scheme/'Click.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{buildref(target,'Click.app')}</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB"><Testables><TestableReference skipped="NO">{buildref(testtarget,'ClickUITests.xctest')}</TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildref(target,'Click.app')}</BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release"><BuildableProductRunnable runnableDebuggingMode="0">{buildref(target,'Click.app')}</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''',encoding='utf-8')
print('Generated ios/Click.xcodeproj and bundled web assets.')
