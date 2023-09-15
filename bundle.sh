mkdir .bundle
cd .bundle
cp -a ../controllers controllers
cp -a ../definitions definitions
cp -a ../public public
cp -a ../modules modules
cp -a ../schemas schemas
cp -a ../views views
total4 --bundle app.bundle
mv app.bundle ../
cd ..
rm -rf .bundle
echo "DONE"